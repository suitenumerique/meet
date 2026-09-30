"""
Test rooms API endpoints in the Meet core app: lobby functionality.
"""

# pylint: disable=W0621,W0613,W0212
import uuid
from unittest import mock

from django.core.cache import cache
from django.http import HttpRequest

import pytest
from freezegun import freeze_time
from rest_framework.test import APIClient

from ... import utils
from ...factories import RoomFactory, UserFactory
from ...models import RoomAccessLevel
from ...services.lobby import (
    LobbyService,
)

pytestmark = pytest.mark.django_db


# Tests for request_entry endpoint


@freeze_time("2025-01-01 10:00:00")
def test_request_entry_anonymous(settings):
    """Anonymous users should be allowed to request entry to a room."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()

    settings.LOBBY_COOKIE_NAME = "mocked-cookie"
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    # Lobby cache should be empty before the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert not lobby_keys

    with (
        mock.patch.object(utils, "notify_participants", return_value=None),
        mock.patch.object(utils, "generate_color", return_value="mocked-color"),
    ):
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "test_user"},
        )

    assert response.status_code == 200

    # Verify the lobby cookie was properly set
    cookie = response.cookies.get("mocked-cookie")
    assert cookie is not None

    participant_id = response.json()["id"]
    assert participant_id.startswith("guest_")
    assert cookie.value != participant_id

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": participant_id,
        "username": "test_user",
        "status": "waiting",
        "color": "mocked-color",
        "entered_at": "2025-01-01T10:00:00+00:00",
        "livekit": None,
    }

    # Verify a participant was stored in cache
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert len(lobby_keys) == 1

    # Verify participant data was correctly stored in cache
    participant_data = cache.get(f"mocked-cache-prefix_{room.id!s}_{participant_id}")
    assert participant_data.get("username") == "test_user"


@freeze_time("2025-01-01 10:00:00")
def test_request_entry_authenticated_user(settings):
    """Authenticated users should be allowed to request entry."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    settings.LOBBY_COOKIE_NAME = "mocked-cookie"
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    # Lobby cache should be empty before the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert not lobby_keys

    with (
        mock.patch.object(utils, "notify_participants", return_value=None),
        mock.patch.object(utils, "generate_color", return_value="mocked-color"),
    ):
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "test_user"},
        )

    assert response.status_code == 200

    # Verify the lobby cookie was properly set
    cookie = response.cookies.get("mocked-cookie")
    assert cookie is not None

    participant_id = response.json()["id"]
    assert participant_id.startswith("guest_")
    assert cookie.value != participant_id

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": participant_id,
        "username": "test_user",
        "status": "waiting",
        "color": "mocked-color",
        "entered_at": "2025-01-01T10:00:00+00:00",
        "livekit": None,
    }

    # Verify a participant was stored in cache
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert len(lobby_keys) == 1

    # Verify participant data was correctly stored in cache
    participant_data = cache.get(f"mocked-cache-prefix_{room.id!s}_{participant_id}")
    assert participant_data.get("username") == "test_user"


@freeze_time("2025-01-01 10:00:00")
def test_request_entry_with_existing_participants(settings):
    """Anonymous users should be allowed to request entry to a room with existing participants."""
    # Create a restricted access room
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()

    # Configure test settings for cookies and cache
    settings.LOBBY_COOKIE_NAME = "mocked-cookie"
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    # Add two participants already waiting in the lobby
    cache.set(
        f"mocked-cache-prefix_{room.id}_2f7f162f-e7d1-421b-90e7-02bfbfbf8def",
        {
            "id": "2f7f162f-e7d1-421b-90e7-02bfbfbf8def",
            "username": "user1",
            "status": "waiting",
            "color": "#123456",
            "entered_at": "2025-01-01T10:00:00+00:00",
        },
    )
    cache.set(
        f"mocked-cache-prefix_{room.id}_f4ca3ab8a6c04ad88097b8da33f60f10",
        {
            "id": "f4ca3ab8a6c04ad88097b8da33f60f10",
            "username": "user2",
            "status": "accepted",
            "color": "#654321",
            "entered_at": "2025-01-01T10:00:00+00:00",
        },
    )

    # Verify two participants are in the lobby before the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert len(lobby_keys) == 2

    # Mock external service calls to isolate the test
    with (
        mock.patch.object(utils, "notify_participants", return_value=None),
        mock.patch.object(utils, "generate_color", return_value="mocked-color"),
    ):
        # Make request as a new anonymous user
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "test_user"},
        )

    # Verify successful response
    assert response.status_code == 200

    # Verify the lobby cookie was properly set for the new participant
    cookie = response.cookies.get("mocked-cookie")
    assert cookie is not None

    participant_id = response.json()["id"]
    assert participant_id.startswith("guest_")
    assert cookie.value != participant_id

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": participant_id,
        "username": "test_user",
        "entered_at": "2025-01-01T10:00:00+00:00",
        "status": "waiting",
        "color": "mocked-color",
        "livekit": None,
    }

    # Verify now three participants are in the lobby cache
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert len(lobby_keys) == 3

    # Verify the new participant data was correctly stored in cache
    participant_data = cache.get(f"mocked-cache-prefix_{room.id!s}_{participant_id}")
    assert participant_data.get("username") == "test_user"


@freeze_time("2025-01-01 10:00:00")
def test_request_entry_public_room(settings):
    """Entry requests to public rooms should return ACCEPTED status with LiveKit config."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()

    settings.LOBBY_COOKIE_NAME = "mocked-cookie"
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    # Lobby cache should be empty before the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert not lobby_keys

    with (
        mock.patch.object(utils, "notify_participants", return_value=None),
        mock.patch.object(
            utils, "generate_livekit_config", return_value={"token": "test-token"}
        ),
        mock.patch.object(utils, "generate_color", return_value="mocked-color"),
    ):
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "test_user"},
        )

    assert response.status_code == 200

    # Verify the lobby cookie was set
    cookie = response.cookies.get("mocked-cookie")
    assert cookie is not None
    participant_id = response.json()["id"]
    assert participant_id.startswith("guest_")

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": participant_id,
        "username": "test_user",
        "entered_at": "2025-01-01T10:00:00+00:00",
        "status": "accepted",
        "color": "mocked-color",
        "livekit": {"token": "test-token"},
    }

    # Verify lobby cache is still empty after the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert not lobby_keys


@freeze_time("2025-01-01 10:00:00")
def test_request_entry_authenticated_user_public_room(settings):
    """While authenticated, entry request to public rooms should get accepted."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    settings.LOBBY_COOKIE_NAME = "mocked-cookie"
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    # Lobby cache should be empty before the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert not lobby_keys

    with (
        mock.patch.object(utils, "notify_participants", return_value=None),
        mock.patch.object(
            utils, "generate_livekit_config", return_value={"token": "test-token"}
        ),
        mock.patch.object(utils, "generate_color", return_value="mocked-color"),
    ):
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "test_user"},
        )

    assert response.status_code == 200

    # Verify the lobby cookie was set
    cookie = response.cookies.get("mocked-cookie")
    assert cookie is not None
    participant_id = response.json()["id"]
    assert participant_id.startswith("guest_")

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": participant_id,
        "username": "test_user",
        "entered_at": "2025-01-01T10:00:00+00:00",
        "status": "accepted",
        "color": "mocked-color",
        "livekit": {"token": "test-token"},
    }

    # Verify lobby cache is still empty after the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert not lobby_keys


@freeze_time("2025-01-01 10:00:00")
def test_request_entry_waiting_participant_public_room(settings):
    """While waiting, entry request to public rooms should get accepted."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()

    settings.LOBBY_COOKIE_NAME = "mocked-cookie"
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    guest_cookie = LobbyService.sign_guest_capability(str(uuid.uuid4()))
    guest_request = HttpRequest()
    guest_request.COOKIES["mocked-cookie"] = guest_cookie
    participant_id = LobbyService.get_or_create_participant_id(guest_request, room.id)

    # Add a waiting participant to the room's lobby cache
    cache.set(
        f"mocked-cache-prefix_{room.id}_{participant_id}",
        {
            "id": participant_id,
            "username": "user1",
            "status": "waiting",
            "color": "#123456",
            "entered_at": "2025-01-01T10:00:00+00:00",
        },
    )

    # Simulate a browser with existing participant cookie
    client.cookies.load({"mocked-cookie": guest_cookie})

    with (
        mock.patch.object(utils, "notify_participants", return_value=None),
        mock.patch.object(
            utils, "generate_livekit_config", return_value={"token": "test-token"}
        ),
    ):
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "user1"},
        )

    assert response.status_code == 200

    # Verify the lobby cookie was set
    cookie = response.cookies.get("mocked-cookie")
    assert cookie is not None

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": participant_id,
        "username": "user1",
        "status": "accepted",
        "color": "#123456",
        "entered_at": "2025-01-01T10:00:00+00:00",
        "livekit": {"token": "test-token"},
    }

    # Verify participant remains in the lobby cache after acceptance
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert len(lobby_keys) == 1


def test_request_entry_invalid_data():
    """Should return 400 for invalid request data."""
    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/request-entry/",
        {},  # Missing required username field
    )

    assert response.status_code == 400


def test_request_entry_room_not_found():
    """Should return 404 for non-existent room."""
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{uuid.uuid4()!s}/request-entry/",
        {"username": "anonymous"},
    )

    assert response.status_code == 404


# Tests for allow_participant_to_enter endpoint

GUEST_ID = "guest_" + "a" * 40


def test_allow_participant_to_enter_anonymous():
    """Anonymous users should not be allowed to manage entry requests."""
    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": GUEST_ID, "allow_entry": True},
    )

    assert response.status_code == 401


def test_allow_participant_to_enter_non_owner():
    """Non-privileged users should not be allowed to manage entry requests."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": GUEST_ID, "allow_entry": True},
    )

    assert response.status_code == 403


def test_allow_participant_to_enter_public_room():
    """Should return 404 for public rooms that don't use the lobby system."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": GUEST_ID, "allow_entry": True},
    )

    assert response.status_code == 404
    assert response.json() == {"message": "Room has no lobby system."}


@pytest.mark.parametrize(
    "allow_entry, updated_status", [(True, "accepted"), (False, "denied")]
)
def test_allow_participant_to_enter_success(settings, allow_entry, updated_status):
    """Should successfully update participant status when everything is correct."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    cache.set(
        f"mocked-cache-prefix_{room.id!s}_{GUEST_ID}",
        {
            "id": GUEST_ID,
            "status": "waiting",
            "username": "foo",
            "color": "123",
            "entered_at": "2025-01-01T10:00:00+00:00",
        },
    )

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {
            "participant_id": GUEST_ID,
            "allow_entry": allow_entry,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Participant was updated."}

    participant_data = cache.get(f"mocked-cache-prefix_{room.id!s}_{GUEST_ID}")
    assert participant_data.get("status") == updated_status


def test_allow_participant_to_enter_participant_not_found(settings):
    """Should handle case when participant is not found."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    participant_data = cache.get(f"mocked-cache-prefix_{room.id!s}_{GUEST_ID}")
    assert participant_data is None

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": GUEST_ID, "allow_entry": True},
    )

    assert response.status_code == 404
    assert response.json() == {"message": "Participant not found."}


def test_allow_participant_to_enter_invalid_data():
    """Should return 400 for invalid request data."""
    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {},  # Missing required fields
    )

    assert response.status_code == 400


@pytest.mark.parametrize("authenticated", [False, True])
@pytest.mark.parametrize("allow_entry", [False, True])
def test_lobby_decision_accepts_returned_guest_identity(authenticated, allow_entry):
    """Managers can decide actual requests using the identity returned by the lobby."""
    owner = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    room.accesses.create(user=owner, role="owner")
    participant = APIClient()
    if authenticated:
        participant.force_login(UserFactory())
    manager = APIClient()
    manager.force_login(owner)

    with mock.patch.object(utils, "notify_participants"):
        requested = participant.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/", {"username": "Guest"}
        )
    assert requested.status_code == 200
    participant_id = requested.json()["id"]
    assert participant_id.startswith("guest_")

    waiting = manager.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")
    assert waiting.status_code == 200
    assert waiting.json()["participants"][0]["id"] == participant_id
    decision_url = f"/api/v1.0/rooms/{room.id}/enter/"
    payload = {"participant_id": participant_id, "allow_entry": allow_entry}
    refused = participant.post(decision_url, payload)
    assert refused.status_code == (403 if authenticated else 401)

    decided = manager.post(decision_url, payload)
    assert decided.status_code == 200, decided.json()
    with mock.patch.object(
        utils, "generate_livekit_config", return_value={"token": "accepted-token"}
    ):
        polled = participant.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/", {"username": "Guest"}
        )
    assert polled.status_code == 200
    assert polled.json()["id"] == participant_id
    assert polled.json()["status"] == ("accepted" if allow_entry else "denied")
    assert polled.json()["livekit"] == (
        {"token": "accepted-token"} if allow_entry else None
    )


@pytest.mark.parametrize(
    "participant_id",
    [
        "guest_invalid",
        "guest_" + "a" * 39,
        "guest_" + "a" * 41,
        "guest_" + "G" * 40,
        " guest_" + "a" * 40,
        "guest_" + "a" * 40 + "\n",
        "2f7f162f-e7d1-421b-90e7-02bfbfbf8def",
    ],
)
def test_lobby_decision_rejects_malformed_guest_identity(participant_id):
    """Only the exact server-issued guest identity format is accepted."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    owner = UserFactory()
    room.accesses.create(user=owner, role="owner")
    manager = APIClient()
    manager.force_login(owner)
    response = manager.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": participant_id, "allow_entry": True},
    )
    assert response.status_code == 400


def test_lobby_decision_cannot_admit_guest_from_another_room():
    """A valid guest identity remains authorized only within its parent lobby."""
    owner = UserFactory()
    rooms = [RoomFactory(access_level=RoomAccessLevel.RESTRICTED) for _ in range(2)]
    for room in rooms:
        room.accesses.create(user=owner, role="owner")
    participant = APIClient()
    with mock.patch.object(utils, "notify_participants"):
        requested = participant.post(
            f"/api/v1.0/rooms/{rooms[0].id}/request-entry/", {"username": "Guest"}
        )
    assert requested.status_code == 200
    participant_id = requested.json()["id"]
    manager = APIClient()
    manager.force_login(owner)
    response = manager.post(
        f"/api/v1.0/rooms/{rooms[1].id}/enter/",
        {"participant_id": participant_id, "allow_entry": True},
    )
    assert response.status_code == 404
    waiting = manager.get(f"/api/v1.0/rooms/{rooms[0].id}/waiting-participants/")
    assert waiting.json()["participants"][0]["status"] == "waiting"


# Tests for list_waiting_participants endpoint


def test_list_waiting_participants_anonymous():
    """Anonymous users should not be allowed to list waiting participants."""
    room = RoomFactory()
    client = APIClient()

    response = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")

    assert response.status_code == 401


def test_list_waiting_participants_non_owner():
    """Non-privileged users should not be allowed to list waiting participants."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")

    assert response.status_code == 403


def test_list_waiting_participants_public_room():
    """Should return empty list for public rooms."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    # Lobby cache should be empty before the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert not lobby_keys

    with mock.patch(
        "core.api.viewsets.LobbyService", autospec=True
    ) as mocked_lobby_service:
        response = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")

    # Verify lobby service was not instantiated
    mocked_lobby_service.assert_not_called()

    assert response.status_code == 200
    assert response.json() == {"participants": []}


def test_list_waiting_participants_success(settings):
    """Should successfully return list of waiting participants."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    # Add participants in the lobby
    cache.set(
        f"mocked-cache-prefix_{room.id}_2f7f162f-e7d1-421b-90e7-02bfbfbf8def",
        {
            "id": "2f7f162f-e7d1-421b-90e7-02bfbfbf8def",
            "username": "user1",
            "status": "waiting",
            "color": "#123456",
            "entered_at": "2025-01-01T10:00:00+00:00",
        },
    )
    cache.set(
        f"mocked-cache-prefix_{room.id}_f4ca3ab8a6c04ad88097b8da33f60f10",
        {
            "id": "f4ca3ab8a6c04ad88097b8da33f60f10",
            "username": "user2",
            "status": "waiting",
            "color": "#654321",
            "entered_at": "2025-01-01T10:05:00+00:00",
        },
    )
    lobby_service = LobbyService()
    lobby_service._index_add(room.id, "2f7f162f-e7d1-421b-90e7-02bfbfbf8def")
    lobby_service._index_add(room.id, "f4ca3ab8a6c04ad88097b8da33f60f10")

    response = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")

    assert response.status_code == 200

    assert response.json() == {
        "participants": [
            {
                "id": "f4ca3ab8a6c04ad88097b8da33f60f10",
                "username": "user2",
                "status": "waiting",
                "color": "#654321",
                "entered_at": "2025-01-01T10:05:00+00:00",
            },
            {
                "id": "2f7f162f-e7d1-421b-90e7-02bfbfbf8def",
                "username": "user1",
                "status": "waiting",
                "color": "#123456",
                "entered_at": "2025-01-01T10:00:00+00:00",
            },
        ]
    }


def test_list_waiting_participants_empty(settings):
    """Should handle case when there are no waiting participants."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    # Lobby cache should be empty before the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert not lobby_keys

    response = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")

    assert response.status_code == 200
    assert response.json() == {"participants": []}


@mock.patch.object(utils, "notify_participants", return_value=None)
@mock.patch.object(
    utils, "generate_livekit_config", return_value={"token": "test-token"}
)
def test_request_entry_throttling_anonymous_without_cookie(
    mock_notify_participants, mock_generate_livekit_config, settings
):
    """Anonymous users without a cookie should not be throttled."""

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()

    settings.LOBBY_COOKIE_NAME = "mocked-cookie"
    settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["request_entry"] = "1/minute"

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/request-entry/",
        {"username": "test_user"},
    )

    assert response.status_code == 200
    assert response.cookies.get("mocked-cookie") is not None

    client.cookies.clear()  # Simulate a new cookieless request

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/request-entry/",
        {"username": "test_user"},
    )

    assert response.status_code == 200


@mock.patch.object(utils, "notify_participants", return_value=None)
@mock.patch.object(
    utils, "generate_livekit_config", return_value={"token": "test-token"}
)
def test_request_entry_throttling_anonymous_with_cookie(
    mock_notify_participants, mock_generate_livekit_config, settings
):
    """Anonymous users with a cookie should be throttled after exceeding the rate limit."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()

    settings.LOBBY_COOKIE_NAME = "mocked-cookie"
    settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["request_entry"] = "2/minute"

    # A capability of its own, since the throttle cache is shared across tests
    capability = str(uuid.uuid4())
    client.cookies.load(
        {"mocked-cookie": LobbyService.sign_guest_capability(capability)}
    )

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/request-entry/",
        {"username": "test_user"},
    )
    assert response.status_code == 200

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/request-entry/",
        {"username": "test_user"},
    )
    assert response.status_code == 200

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/request-entry/",
        {"username": "test_user"},
    )

    assert response.status_code == 429


@mock.patch.object(utils, "notify_participants", return_value=None)
@mock.patch.object(
    utils, "generate_livekit_config", return_value={"token": "test-token"}
)
def test_request_entry_throttling_authenticated_user(
    mock_notify_participants, mock_generate_livekit_config, settings
):
    """Authenticated users should be throttled."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    settings.LOBBY_COOKIE_NAME = "mocked-cookie"
    settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["request_entry"] = "2/minute"

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/request-entry/",
        {"username": "test_user"},
    )
    assert response.status_code == 200

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/request-entry/",
        {"username": "test_user"},
    )
    assert response.status_code == 200

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/request-entry/",
        {"username": "test_user"},
    )

    assert response.status_code == 429
