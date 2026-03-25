"""Integration / MVC tests for waiting room (lobby) and participant management flows.

Repo issue #9 asks for integration coverage around:
  - waiting room enable/disable behavior
  - join -> wait -> admit/deny flows
  - notifications to moderators
  - moderator permissions (incl. multiple moderators)
  - participant removal (kick) and state cleanup

These tests focus on the backend request/response cycle while keeping external
dependencies mocked (LiveKit + realtime notifications).
"""

# pylint: disable=redefined-outer-name

import uuid
from unittest import mock

from django.core.cache import cache

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import RoomAccessLevel

pytestmark = pytest.mark.django_db


@pytest.fixture
def lobby_test_settings(settings):
    """Provide isolated lobby settings for each test.

    We use a random cache key prefix to prevent leakage between tests because
    the Redis cache is shared.
    """

    settings.LOBBY_COOKIE_NAME = "test-lobby-cookie"
    settings.LOBBY_KEY_PREFIX = f"test-lobby-{uuid.uuid4().hex}"
    settings.LOBBY_NOTIFICATION_TYPE = "lobby.participant_waiting"

    # Keep timeouts short; tests assert state transitions, not timeout behavior.
    settings.LOBBY_WAITING_TIMEOUT = 60
    settings.LOBBY_ACCEPTED_TIMEOUT = 60
    settings.LOBBY_DENIED_TIMEOUT = 60

    yield settings

    # Best-effort cleanup (useful when running tests against a real Redis instance).
    keys = cache.keys(f"{settings.LOBBY_KEY_PREFIX}_*")
    if keys:
        cache.delete_many(keys)


def _create_moderator(room, *, role="owner"):
    """Create a user with moderator privileges on the given room."""
    user = UserFactory()
    room.accesses.create(user=user, role=role)
    return user


def test_waiting_room_disabled_public_room_allows_direct_join(lobby_test_settings):
    """Public rooms bypass the waiting room and immediately return LiveKit config."""

    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()

    with (
        mock.patch("core.utils.generate_color", return_value="mocked-color"),
        mock.patch(
            "core.utils.generate_livekit_config", return_value={"token": "test-token"}
        ),
        mock.patch("core.utils.notify_participants") as mocked_notify,
    ):
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "Alice"},
            format="json",
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "accepted"
    assert response.json()["livekit"] == {"token": "test-token"}

    # Public rooms should not notify moderators via the lobby mechanism.
    mocked_notify.assert_not_called()

    # Public rooms should not persist lobby state in cache.
    lobby_keys = cache.keys(f"{lobby_test_settings.LOBBY_KEY_PREFIX}_{room.id}_*")
    assert lobby_keys == []


def test_waiting_room_enabled_restricted_room_places_participant_in_waiting_room(
    lobby_test_settings,
):
    """Restricted rooms should place participants in the lobby and notify moderators."""

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()

    with (
        mock.patch("core.utils.generate_color", return_value="mocked-color"),
        mock.patch(
            "core.utils.notify_participants", return_value=None
        ) as mocked_notify,
    ):
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "Alice"},
            format="json",
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "waiting"
    assert response.json()["livekit"] is None

    # Ensure a lobby notification is emitted to the room.
    mocked_notify.assert_called_once_with(
        room_name=str(room.id),
        notification_data={"type": lobby_test_settings.LOBBY_NOTIFICATION_TYPE},
    )

    # Ensure participant state is persisted in cache.
    participant_id = response.cookies[lobby_test_settings.LOBBY_COOKIE_NAME].value
    cache_key = f"{lobby_test_settings.LOBBY_KEY_PREFIX}_{room.id}_{participant_id}"
    assert cache.get(cache_key)["status"] == "waiting"


def test_end_to_end_participant_waits_then_moderator_admits_then_participant_joins(
    lobby_test_settings,
):
    """End-to-end flow: participant waits → moderator admits → participant joins."""

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    moderator = _create_moderator(room, role="owner")
    moderator_client = APIClient()
    moderator_client.force_login(moderator)

    participant_client = APIClient()

    # Step 1: participant requests entry and is placed in waiting room.
    with (
        mock.patch("core.utils.generate_color", return_value="mocked-color"),
        mock.patch("core.utils.notify_participants", return_value=None),
    ):
        response = participant_client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "Alice"},
            format="json",
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "waiting"
    assert response.json()["livekit"] is None

    participant_id = response.cookies[lobby_test_settings.LOBBY_COOKIE_NAME].value

    # Step 2: moderator sees waiting participants.
    list_response = moderator_client.get(
        f"/api/v1.0/rooms/{room.id}/waiting-participants/"
    )
    assert list_response.status_code == status.HTTP_200_OK
    assert [p["id"] for p in list_response.json()["participants"]] == [participant_id]

    # Step 3: moderator admits participant.
    admit_response = moderator_client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": participant_id, "allow_entry": True},
        format="json",
    )
    assert admit_response.status_code == status.HTTP_200_OK

    # Step 4: participant polls again and receives LiveKit config.
    with mock.patch(
        "core.utils.generate_livekit_config", return_value={"token": "test-token"}
    ):
        join_response = participant_client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "Alice"},
            format="json",
        )

    assert join_response.status_code == status.HTTP_200_OK
    assert join_response.json()["status"] == "accepted"
    assert join_response.json()["livekit"] == {"token": "test-token"}

    # Step 5: waiting list is now empty.
    list_response2 = moderator_client.get(
        f"/api/v1.0/rooms/{room.id}/waiting-participants/"
    )
    assert list_response2.status_code == status.HTTP_200_OK
    assert list_response2.json() == {"participants": []}


def test_end_to_end_participant_waits_then_moderator_denies_then_participant_sees_denied(
    lobby_test_settings,
):
    """End-to-end flow: participant waits → moderator denies → participant sees denied."""

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    moderator = _create_moderator(room, role="owner")
    moderator_client = APIClient()
    moderator_client.force_login(moderator)

    participant_client = APIClient()

    with (
        mock.patch("core.utils.generate_color", return_value="mocked-color"),
        mock.patch("core.utils.notify_participants", return_value=None),
    ):
        response = participant_client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "Alice"},
            format="json",
        )

    participant_id = response.cookies[lobby_test_settings.LOBBY_COOKIE_NAME].value

    deny_response = moderator_client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": participant_id, "allow_entry": False},
        format="json",
    )
    assert deny_response.status_code == status.HTTP_200_OK

    # Participant polls again; they should be denied and not receive a token.
    denied_response = participant_client.post(
        f"/api/v1.0/rooms/{room.id}/request-entry/",
        {"username": "Alice"},
        format="json",
    )
    assert denied_response.status_code == status.HTTP_200_OK
    assert denied_response.json()["status"] == "denied"
    assert denied_response.json()["livekit"] is None

    # Denied participants should not appear in waiting list.
    list_response = moderator_client.get(
        f"/api/v1.0/rooms/{room.id}/waiting-participants/"
    )
    assert list_response.status_code == status.HTTP_200_OK
    assert list_response.json() == {"participants": []}
