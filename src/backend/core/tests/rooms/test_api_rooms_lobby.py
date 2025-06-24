"""
Test rooms API endpoints in the Meet core app: lobby functionality.
"""

# pylint: disable=W0621,W0613,W0212
import uuid
from unittest import mock

from django.core.cache import cache

import pytest
from rest_framework.test import APIClient

from ... import utils
from ...factories import RoomFactory, UserFactory
from ...models import RoomAccessLevel
from ...services.lobby import (
    LobbyService,
)

pytestmark = pytest.mark.django_db


# Tests for request_entry endpoint


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
        mock.patch.object(LobbyService, "notify_participants", return_value=None),
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

    participant_id = cookie.value

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": participant_id,
        "username": "test_user",
        "status": "waiting",
        "color": "mocked-color",
        "livekit": None,
    }

    # Verify a participant was stored in cache
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert len(lobby_keys) == 1

    # Verify participant data was correctly stored in cache
    participant_data = cache.get(f"mocked-cache-prefix_{room.id!s}_{participant_id}")
    assert participant_data.get("username") == "test_user"


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
        mock.patch.object(LobbyService, "notify_participants", return_value=None),
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

    participant_id = cookie.value

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": participant_id,
        "username": "test_user",
        "status": "waiting",
        "color": "mocked-color",
        "livekit": None,
    }

    # Verify a participant was stored in cache
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert len(lobby_keys) == 1

    # Verify participant data was correctly stored in cache
    participant_data = cache.get(f"mocked-cache-prefix_{room.id!s}_{participant_id}")
    assert participant_data.get("username") == "test_user"


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
        f"mocked-cache-prefix_{room.id}_2f7f162fe7d1421b90e702bfbfbf8def",
        {
            "id": "2f7f162fe7d1421b90e702bfbfbf8def",
            "username": "user1",
            "status": "waiting",
            "color": "#123456",
        },
    )
    cache.set(
        f"mocked-cache-prefix_{room.id}_f4ca3ab8a6c04ad88097b8da33f60f10",
        {
            "id": "f4ca3ab8a6c04ad88097b8da33f60f10",
            "username": "user2",
            "status": "accepted",
            "color": "#654321",
        },
    )

    # Verify two participants are in the lobby before the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert len(lobby_keys) == 2

    # Mock external service calls to isolate the test
    with (
        mock.patch.object(LobbyService, "notify_participants", return_value=None),
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

    participant_id = cookie.value

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": participant_id,
        "username": "test_user",
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
        mock.patch.object(LobbyService, "notify_participants", return_value=None),
        mock.patch.object(
            LobbyService, "_get_or_create_participant_id", return_value="123"
        ),
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
    assert cookie.value == "123"

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": "123",
        "username": "test_user",
        "status": "accepted",
        "color": "mocked-color",
        "livekit": {"token": "test-token"},
    }

    # Verify lobby cache is still empty after the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert not lobby_keys


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
        mock.patch.object(LobbyService, "notify_participants", return_value=None),
        mock.patch.object(
            LobbyService,
            "_get_or_create_participant_id",
            return_value="2f7f162fe7d1421b90e702bfbfbf8def",
        ),
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
    assert cookie.value == "2f7f162fe7d1421b90e702bfbfbf8def"

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": "2f7f162fe7d1421b90e702bfbfbf8def",
        "username": "test_user",
        "status": "accepted",
        "color": "mocked-color",
        "livekit": {"token": "test-token"},
    }

    # Verify lobby cache is still empty after the request
    lobby_keys = cache.keys(f"mocked-cache-prefix_{room.id}_*")
    assert not lobby_keys


def test_request_entry_waiting_participant_public_room(settings):
    """While waiting, entry request to public rooms should get accepted."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()

    settings.LOBBY_COOKIE_NAME = "mocked-cookie"
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    # Add a waiting participant to the room's lobby cache
    cache.set(
        f"mocked-cache-prefix_{room.id}_2f7f162fe7d1421b90e702bfbfbf8def",
        {
            "id": "2f7f162fe7d1421b90e702bfbfbf8def",
            "username": "user1",
            "status": "waiting",
            "color": "#123456",
        },
    )

    # Simulate a browser with existing participant cookie
    client.cookies.load({"mocked-cookie": "2f7f162fe7d1421b90e702bfbfbf8def"})

    with (
        mock.patch.object(LobbyService, "notify_participants", return_value=None),
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
    assert cookie.value == "2f7f162fe7d1421b90e702bfbfbf8def"

    # Verify response content matches expected structure and values
    assert response.json() == {
        "id": "2f7f162fe7d1421b90e702bfbfbf8def",
        "username": "user1",
        "status": "accepted",
        "color": "#123456",
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


def test_allow_participant_to_enter_anonymous():
    """Anonymous users should not be allowed to manage entry requests."""
    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": "2f7f162fe7d1421b90e702bfbfbf8def", "allow_entry": True},
    )

    assert response.status_code == 401


def test_allow_participant_to_enter_non_owner():
    """Non-privileged users should not be allowed to manage entry requests."""
    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": "2f7f162fe7d1421b90e702bfbfbf8def", "allow_entry": True},
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
        {"participant_id": "2f7f162fe7d1421b90e702bfbfbf8def", "allow_entry": True},
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
        f"mocked-cache-prefix_{room.id!s}_2f7f162fe7d1421b90e702bfbfbf8def",
        {
            "id": "2f7f162fe7d1421b90e702bfbfbf8def",
            "status": "waiting",
            "username": "foo",
            "color": "123",
        },
    )

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {
            "participant_id": "2f7f162fe7d1421b90e702bfbfbf8def",
            "allow_entry": allow_entry,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Participant was updated."}

    participant_data = cache.get(
        f"mocked-cache-prefix_{room.id!s}_2f7f162fe7d1421b90e702bfbfbf8def"
    )
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

    participant_data = cache.get(
        f"mocked-cache-prefix_{room.id!s}_2f7f162fe7d1421b90e702bfbfbf8def"
    )
    assert participant_data is None

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": "2f7f162fe7d1421b90e702bfbfbf8def", "allow_entry": True},
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


# Tests for list_waiting_participants endpoint


def test_list_waiting_participants_anonymous():
    """Anonymous users should not be allowed to list waiting participants."""
    room = RoomFactory()
    client = APIClient()

    response = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")

    assert response.status_code == 401


def test_list_waiting_participants_non_owner():
    """Non-privileged users should not be allowed to list waiting participants."""
    room = RoomFactory()
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
        f"mocked-cache-prefix_{room.id}_2f7f162fe7d1421b90e702bfbfbf8def",
        {
            "id": "2f7f162fe7d1421b90e702bfbfbf8def",
            "username": "user1",
            "status": "waiting",
            "color": "#123456",
        },
    )
    cache.set(
        f"mocked-cache-prefix_{room.id}_f4ca3ab8a6c04ad88097b8da33f60f10",
        {
            "id": "f4ca3ab8a6c04ad88097b8da33f60f10",
            "username": "user2",
            "status": "waiting",
            "color": "#654321",
        },
    )

    response = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")

    assert response.status_code == 200

    participants = response.json().get("participants")
    assert sorted(participants, key=lambda p: p["id"]) == [
        {
            "id": "2f7f162fe7d1421b90e702bfbfbf8def",
            "username": "user1",
            "status": "waiting",
            "color": "#123456",
        },
        {
            "id": "f4ca3ab8a6c04ad88097b8da33f60f10",
            "username": "user2",
            "status": "waiting",
            "color": "#654321",
        },
    ]


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
