"""
Test lobby service.
"""

# pylint: disable=W0621,W0613, W0212, R0913
# ruff: noqa: PLR0913

import uuid
from unittest import mock

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse

import pytest

from core.factories import RoomFactory
from core.models import RoomAccessLevel
from core.services.lobby import (
    LobbyParticipant,
    LobbyParticipantNotFound,
    LobbyParticipantParsingError,
    LobbyParticipantStatus,
    LobbyService,
)
from core.utils import NotificationError

pytestmark = pytest.mark.django_db


@pytest.fixture
def lobby_service():
    """Return a LobbyService instance."""
    return LobbyService()


@pytest.fixture
def participant_id():
    """Return a string ID for test participant."""
    return "test-participant-id"


@pytest.fixture
def username():
    """Return a username for test participant."""
    return "test-username"


@pytest.fixture
def participant_dict():
    """Return a valid participant dictionary."""
    return {
        "status": "waiting",
        "username": "test-username",
        "id": "test-participant-id",
        "color": "#123456",
    }


@pytest.fixture
def participant_data():
    """Return a valid LobbyParticipant instance."""
    return LobbyParticipant(
        status=LobbyParticipantStatus.WAITING,
        username="test-username",
        id="test-participant-id",
        color="#123456",
    )


def test_lobby_participant_to_dict(participant_data):
    """Test LobbyParticipant serialization to dict."""
    result = participant_data.to_dict()

    assert result["status"] == "waiting"
    assert result["username"] == "test-username"
    assert result["id"] == "test-participant-id"
    assert result["color"] == "#123456"


def test_lobby_participant_from_dict_success(participant_dict):
    """Test successful LobbyParticipant creation from dict."""
    participant = LobbyParticipant.from_dict(participant_dict)

    assert participant.status == LobbyParticipantStatus.WAITING
    assert participant.username == "test-username"
    assert participant.id == "test-participant-id"
    assert participant.color == "#123456"


def test_lobby_participant_from_dict_default_status():
    """Test LobbyParticipant creation with missing status defaults to UNKNOWN."""
    data_without_status = {
        "username": "test-username",
        "id": "test-participant-id",
        "color": "#123456",
    }

    participant = LobbyParticipant.from_dict(data_without_status)

    assert participant.status == LobbyParticipantStatus.UNKNOWN
    assert participant.username == "test-username"
    assert participant.id == "test-participant-id"
    assert participant.color == "#123456"


def test_lobby_participant_from_dict_missing_fields():
    """Test LobbyParticipant creation with missing fields."""
    invalid_data = {"username": "test-username"}

    with pytest.raises(LobbyParticipantParsingError, match="Invalid participant data"):
        LobbyParticipant.from_dict(invalid_data)


def test_lobby_participant_from_dict_invalid_status():
    """Test LobbyParticipant creation with invalid status."""
    invalid_data = {
        "status": "invalid_status",
        "username": "test-username",
        "id": "test-participant-id",
        "color": "#123456",
    }

    with pytest.raises(LobbyParticipantParsingError, match="Invalid participant data"):
        LobbyParticipant.from_dict(invalid_data)


def test_get_cache_key(lobby_service, participant_id):
    """Test cache key generation."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key = lobby_service._get_cache_key(room.id, participant_id)

    expected_key = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_{participant_id}"
    assert cache_key == expected_key


def test_get_or_create_participant_id_from_cookie(lobby_service):
    """Test extracting participant ID from cookie."""
    request = mock.Mock()
    request.COOKIES = {settings.LOBBY_COOKIE_NAME: "existing-id"}

    participant_id = lobby_service._get_or_create_participant_id(request)

    assert participant_id == "existing-id"


@mock.patch.object(uuid, "uuid4", return_value="generated-id")
def test_get_or_create_participant_id_new(mock_uuid4, lobby_service):
    """Test creating new participant ID when cookie is missing."""
    request = mock.Mock()
    request.COOKIES = {}

    participant_id = lobby_service._get_or_create_participant_id(request)

    assert participant_id == "generated-id"
    mock_uuid4.assert_called_once()


def test_prepare_response_existing_cookie(lobby_service, participant_id):
    """Test response preparation with existing cookie."""
    response = HttpResponse()
    response.cookies[settings.LOBBY_COOKIE_NAME] = "existing-cookie"

    lobby_service.prepare_response(response, participant_id)

    # Verify cookie wasn't set again
    cookie = response.cookies.get(settings.LOBBY_COOKIE_NAME)
    assert cookie.value == "existing-cookie"
    assert cookie.value != participant_id


def test_prepare_response_new_cookie(lobby_service, participant_id):
    """Test response preparation with new cookie."""
    response = HttpResponse()

    lobby_service.prepare_response(response, participant_id)

    # Verify cookie was set
    cookie = response.cookies.get(settings.LOBBY_COOKIE_NAME)
    assert cookie is not None
    assert cookie.value == participant_id
    assert cookie["httponly"] is True
    assert cookie["secure"] is True
    assert cookie["samesite"] == "Lax"

    # It's a session cookies (no max_age specified):
    assert not cookie["max-age"]


def test_can_bypass_lobby_public_room(lobby_service):
    """Should return True for public rooms regardless of user auth."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    # Anonymous user
    user = mock.Mock()
    user.is_authenticated = False
    assert lobby_service.can_bypass_lobby(room, user) is True

    # Authenticated user
    user.is_authenticated = True
    assert lobby_service.can_bypass_lobby(room, user) is True


def test_can_bypass_lobby_trusted_room_authenticated(lobby_service):
    """Should return True for trusted rooms with authenticated users."""
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)

    # Authenticated user
    user = mock.Mock()
    user.is_authenticated = True
    assert lobby_service.can_bypass_lobby(room, user) is True


def test_can_bypass_lobby_trusted_room_anonymous(lobby_service):
    """Should return False for trusted rooms with anonymous users."""
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)

    # Anonymous user
    user = mock.Mock()
    user.is_authenticated = False
    assert lobby_service.can_bypass_lobby(room, user) is False


def test_can_bypass_lobby_private_room(lobby_service):
    """Should return False for private rooms regardless of user auth."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    # Anonymous user
    user = mock.Mock()
    user.is_authenticated = False
    assert lobby_service.can_bypass_lobby(room, user) is False

    # Authenticated user
    user.is_authenticated = True
    assert lobby_service.can_bypass_lobby(room, user) is False


@mock.patch("core.utils.generate_livekit_config")
def test_request_entry_public_room(
    mock_generate_config, lobby_service, participant_id, username
):
    """Test requesting entry to a public room."""
    request = mock.Mock()
    request.user = mock.Mock()

    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    mocked_participant = LobbyParticipant(
        status=LobbyParticipantStatus.UNKNOWN,
        username=username,
        id=participant_id,
        color="#123456",
    )

    lobby_service._get_or_create_participant_id = mock.Mock(return_value=participant_id)
    lobby_service._get_participant = mock.Mock(return_value=mocked_participant)
    mock_generate_config.return_value = {"token": "test-token"}

    participant, livekit_config = lobby_service.request_entry(room, request, username)

    assert participant.status == LobbyParticipantStatus.ACCEPTED
    assert livekit_config == {"token": "test-token"}
    mock_generate_config.assert_called_once_with(
        room_id=str(room.id),
        user=request.user,
        username=username,
        color=participant.color,
        configuration=room.configuration,
        is_admin_or_owner=False,
        participant_id="test-participant-id",
    )

    lobby_service._get_participant.assert_called_once_with(room.id, participant_id)


@mock.patch("core.utils.generate_livekit_config")
def test_request_entry_trusted_room(
    mock_generate_config, lobby_service, participant_id, username
):
    """Test requesting entry to a trusted room when the user is authenticated."""
    request = mock.Mock()
    request.user = mock.Mock()
    request.user.is_authenticated = True

    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)

    mocked_participant = LobbyParticipant(
        status=LobbyParticipantStatus.UNKNOWN,
        username=username,
        id=participant_id,
        color="#123456",
    )

    lobby_service._get_or_create_participant_id = mock.Mock(return_value=participant_id)
    lobby_service._get_participant = mock.Mock(return_value=mocked_participant)
    mock_generate_config.return_value = {"token": "test-token"}

    participant, livekit_config = lobby_service.request_entry(room, request, username)

    assert participant.status == LobbyParticipantStatus.ACCEPTED
    assert livekit_config == {"token": "test-token"}
    mock_generate_config.assert_called_once_with(
        room_id=str(room.id),
        user=request.user,
        username=username,
        color=participant.color,
        configuration=room.configuration,
        is_admin_or_owner=False,
        participant_id="test-participant-id",
    )

    lobby_service._get_participant.assert_called_once_with(room.id, participant_id)


@mock.patch("core.services.lobby.LobbyService.enter")
def test_request_entry_new_participant(
    mock_enter, lobby_service, participant_id, username
):
    """Test requesting entry for a new participant."""
    request = mock.Mock()
    request.COOKIES = {settings.LOBBY_COOKIE_NAME: participant_id}

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    lobby_service._get_or_create_participant_id = mock.Mock(return_value=participant_id)
    lobby_service._get_participant = mock.Mock(return_value=None)

    participant_data = LobbyParticipant(
        status=LobbyParticipantStatus.WAITING,
        username=username,
        id=participant_id,
        color="#123456",
    )
    mock_enter.return_value = participant_data

    participant, livekit_config = lobby_service.request_entry(room, request, username)

    assert participant == participant_data
    assert livekit_config is None
    mock_enter.assert_called_once_with(room.id, participant_id, username)
    lobby_service._get_participant.assert_called_once_with(room.id, participant_id)


@mock.patch("core.services.lobby.LobbyService.refresh_waiting_status")
def test_request_entry_waiting_participant(
    mock_refresh, lobby_service, participant_id, username
):
    """Test requesting entry for a waiting participant."""
    request = mock.Mock()
    request.COOKIES = {settings.LOBBY_COOKIE_NAME: participant_id}

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    mocked_participant = LobbyParticipant(
        status=LobbyParticipantStatus.WAITING,
        username=username,
        id=participant_id,
        color="#123456",
    )
    lobby_service._get_or_create_participant_id = mock.Mock(return_value=participant_id)
    lobby_service._get_participant = mock.Mock(return_value=mocked_participant)

    participant, livekit_config = lobby_service.request_entry(room, request, username)

    assert participant.status == LobbyParticipantStatus.WAITING
    assert livekit_config is None
    mock_refresh.assert_called_once_with(room.id, participant_id)
    lobby_service._get_participant.assert_called_once_with(room.id, participant_id)


@mock.patch("core.utils.generate_livekit_config")
def test_request_entry_accepted_participant(
    mock_generate_config, lobby_service, participant_id, username
):
    """Test requesting entry for an accepted participant."""
    request = mock.Mock()
    request.user = mock.Mock()
    request.COOKIES = {settings.LOBBY_COOKIE_NAME: participant_id}

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    mocked_participant = LobbyParticipant(
        status=LobbyParticipantStatus.ACCEPTED,
        username=username,
        id=participant_id,
        color="#123456",
    )
    lobby_service._get_or_create_participant_id = mock.Mock(return_value=participant_id)
    lobby_service._get_participant = mock.Mock(return_value=mocked_participant)

    mock_generate_config.return_value = {"token": "test-token"}

    participant, livekit_config = lobby_service.request_entry(room, request, username)

    assert participant.status == LobbyParticipantStatus.ACCEPTED
    assert livekit_config == {"token": "test-token"}
    mock_generate_config.assert_called_once_with(
        room_id=str(room.id),
        user=request.user,
        username=username,
        color="#123456",
        configuration=room.configuration,
        is_admin_or_owner=False,
        participant_id="test-participant-id",
    )
    lobby_service._get_participant.assert_called_once_with(room.id, participant_id)


@mock.patch("core.services.lobby.cache")
def test_refresh_waiting_status(mock_cache, lobby_service, participant_id):
    """Test refreshing waiting status for a participant."""
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    lobby_service.refresh_waiting_status(room.id, participant_id)
    mock_cache.touch.assert_called_once_with(
        "mocked_cache_key", settings.LOBBY_WAITING_TIMEOUT
    )


# pylint: disable=R0917
@mock.patch("core.services.lobby.cache")
@mock.patch("core.utils.generate_color")
@mock.patch("core.utils.notify_participants")
def test_enter_success(
    mock_notify,
    mock_generate_color,
    mock_cache,
    lobby_service,
    participant_id,
    username,
):
    """Test successful participant entry."""
    mock_generate_color.return_value = "#123456"
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    participant = lobby_service.enter(room.id, participant_id, username)

    mock_generate_color.assert_called_once_with(participant_id)
    assert participant.status == LobbyParticipantStatus.WAITING
    assert participant.username == username
    assert participant.id == participant_id
    assert participant.color == "#123456"

    lobby_service._get_cache_key.assert_called_once_with(room.id, participant_id)

    mock_cache.set.assert_called_once_with(
        "mocked_cache_key",
        participant.to_dict(),
        timeout=settings.LOBBY_WAITING_TIMEOUT,
    )
    mock_notify.assert_called_once_with(
        room_name=str(room.id), notification_data={"type": "participantWaiting"}
    )


# pylint: disable=R0917
@mock.patch("core.services.lobby.cache")
@mock.patch("core.utils.generate_color")
@mock.patch("core.utils.notify_participants")
def test_enter_with_notification_error(
    mock_notify,
    mock_generate_color,
    mock_cache,
    lobby_service,
    participant_id,
    username,
):
    """Test participant entry with notification error."""
    mock_generate_color.return_value = "#123456"
    mock_notify.side_effect = NotificationError("Error notifying")
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    participant = lobby_service.enter(room.id, participant_id, username)

    mock_generate_color.assert_called_once_with(participant_id)
    assert participant.status == LobbyParticipantStatus.WAITING
    assert participant.username == username

    lobby_service._get_cache_key.assert_called_once_with(room.id, participant_id)

    mock_cache.set.assert_called_once_with(
        "mocked_cache_key",
        participant.to_dict(),
        timeout=settings.LOBBY_WAITING_TIMEOUT,
    )


@mock.patch("core.services.lobby.cache")
def test_get_participant_not_found(mock_cache, lobby_service, participant_id):
    """Test getting a participant that doesn't exist."""
    mock_cache.get.return_value = None
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    result = lobby_service._get_participant(room.id, participant_id)

    assert result is None

    lobby_service._get_cache_key.assert_called_once_with(room.id, participant_id)
    mock_cache.get.assert_called_once_with("mocked_cache_key")


@mock.patch("core.services.lobby.cache")
@mock.patch("core.services.lobby.LobbyParticipant.from_dict")
def test_get_participant_parsing_error(
    mock_from_dict, mock_cache, lobby_service, participant_id
):
    """Test handling corrupted participant data."""
    mock_cache.get.return_value = {"some": "data"}
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")
    mock_from_dict.side_effect = LobbyParticipantParsingError("Invalid data")

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    result = lobby_service._get_participant(room.id, participant_id)

    assert result is None
    lobby_service._get_cache_key.assert_called_once_with(room.id, participant_id)
    mock_cache.delete.assert_called_once_with("mocked_cache_key")


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants_empty(mock_cache, lobby_service):
    """Test listing waiting participants when none exist."""
    mock_cache.keys.return_value = []

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    result = lobby_service.list_waiting_participants(room.id)

    assert result == []
    pattern = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_*"
    mock_cache.keys.assert_called_once_with(pattern)
    mock_cache.get_many.assert_not_called()


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants(mock_cache, lobby_service, participant_dict):
    """Test listing waiting participants with valid data."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant1"
    mock_cache.keys.return_value = [cache_key]
    mock_cache.get_many.return_value = {cache_key: participant_dict}

    result = lobby_service.list_waiting_participants(room.id)

    assert len(result) == 1
    assert result[0]["status"] == "waiting"
    assert result[0]["username"] == "test-username"
    pattern = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_*"
    mock_cache.keys.assert_called_once_with(pattern)
    mock_cache.get_many.assert_called_once_with([cache_key])


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants_multiple(mock_cache, lobby_service):
    """Test listing multiple waiting participants with valid data."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key1 = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant1"
    cache_key2 = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant2"

    participant1 = {
        "status": "waiting",
        "username": "user1",
        "id": "participant1",
        "color": "#123456",
    }

    participant2 = {
        "status": "waiting",
        "username": "user2",
        "id": "participant2",
        "color": "#654321",
    }

    mock_cache.keys.return_value = [cache_key1, cache_key2]
    mock_cache.get_many.return_value = {
        cache_key1: participant1,
        cache_key2: participant2,
    }

    result = lobby_service.list_waiting_participants(room.id)

    assert len(result) == 2

    # Verify both participants are in the result
    assert any(p["id"] == "participant1" and p["username"] == "user1" for p in result)
    assert any(p["id"] == "participant2" and p["username"] == "user2" for p in result)

    # Verify all participants have waiting status
    assert all(p["status"] == "waiting" for p in result)

    pattern = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_*"
    mock_cache.keys.assert_called_once_with(pattern)
    mock_cache.get_many.assert_called_once_with([cache_key1, cache_key2])


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants_corrupted_data(mock_cache, lobby_service):
    """Test listing waiting participants with corrupted data."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant1"
    mock_cache.keys.return_value = [cache_key]
    mock_cache.get_many.return_value = {cache_key: {"invalid": "data"}}

    result = lobby_service.list_waiting_participants(room.id)

    assert result == []
    mock_cache.delete.assert_called_once_with(cache_key)


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants_partially_corrupted(mock_cache, lobby_service):
    """Test listing waiting participants with one valid and one corrupted entry."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key1 = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant1"
    cache_key2 = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant2"

    valid_participant = {
        "status": "waiting",
        "username": "user2",
        "id": "participant2",
        "color": "#654321",
    }

    corrupted_participant = {"invalid": "data"}

    mock_cache.keys.return_value = [cache_key1, cache_key2]
    mock_cache.get_many.return_value = {
        cache_key1: corrupted_participant,
        cache_key2: valid_participant,
    }

    result = lobby_service.list_waiting_participants(room.id)

    # Check that only the valid participant is returned
    assert len(result) == 1
    assert result[0]["id"] == "participant2"
    assert result[0]["status"] == "waiting"
    assert result[0]["username"] == "user2"

    # Verify corrupted entry was deleted
    mock_cache.delete.assert_called_once_with(cache_key1)

    # Verify both cache keys were queried
    pattern = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_*"
    mock_cache.keys.assert_called_once_with(pattern)
    mock_cache.get_many.assert_called_once_with([cache_key1, cache_key2])


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants_non_waiting(mock_cache, lobby_service):
    """Test listing only waiting participants (not accepted/denied)."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key1 = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant1"
    cache_key2 = f"{settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant2"

    participant1 = {
        "status": "waiting",
        "username": "user1",
        "id": "participant1",
        "color": "#123456",
    }
    participant2 = {
        "status": "accepted",
        "username": "user2",
        "id": "participant2",
        "color": "#654321",
    }

    mock_cache.keys.return_value = [cache_key1, cache_key2]
    mock_cache.get_many.return_value = {
        cache_key1: participant1,
        cache_key2: participant2,
    }

    result = lobby_service.list_waiting_participants(room.id)

    assert len(result) == 1
    assert result[0]["id"] == "participant1"
    assert result[0]["status"] == "waiting"


@mock.patch("core.services.lobby.LobbyService._update_participant_status")
def test_handle_participant_entry_allow(mock_update, lobby_service, participant_id):
    """Test handling allowed participant entry."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    lobby_service.handle_participant_entry(room.id, participant_id, allow_entry=True)

    mock_update.assert_called_once_with(
        room.id,
        participant_id,
        status=LobbyParticipantStatus.ACCEPTED,
        timeout=settings.LOBBY_ACCEPTED_TIMEOUT,
    )


@mock.patch("core.services.lobby.LobbyService._update_participant_status")
def test_handle_participant_entry_deny(mock_update, lobby_service, participant_id):
    """Test handling denied participant entry."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    lobby_service.handle_participant_entry(room.id, participant_id, allow_entry=False)

    mock_update.assert_called_once_with(
        room.id,
        participant_id,
        status=LobbyParticipantStatus.DENIED,
        timeout=settings.LOBBY_DENIED_TIMEOUT,
    )


@mock.patch("core.services.lobby.cache")
def test_update_participant_status_not_found(mock_cache, lobby_service, participant_id):
    """Test updating status for non-existent participant."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    mock_cache.get.return_value = None
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    with pytest.raises(LobbyParticipantNotFound, match="Participant not found"):
        lobby_service._update_participant_status(
            room.id,
            participant_id,
            status=LobbyParticipantStatus.ACCEPTED,
            timeout=60,
        )

    lobby_service._get_cache_key.assert_called_once_with(room.id, participant_id)
    mock_cache.get.assert_called_once_with("mocked_cache_key")


@mock.patch("core.services.lobby.cache")
@mock.patch("core.services.lobby.LobbyParticipant.from_dict")
def test_update_participant_status_corrupted_data(
    mock_from_dict, mock_cache, lobby_service, participant_id
):
    """Test updating status with corrupted participant data."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    mock_cache.get.return_value = {"some": "data"}
    mock_from_dict.side_effect = LobbyParticipantParsingError("Invalid data")
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    with pytest.raises(LobbyParticipantParsingError):
        lobby_service._update_participant_status(
            room.id,
            participant_id,
            status=LobbyParticipantStatus.ACCEPTED,
            timeout=60,
        )

    mock_cache.delete.assert_called_once_with("mocked_cache_key")
    lobby_service._get_cache_key.assert_called_once_with(room.id, participant_id)


@mock.patch("core.services.lobby.cache")
def test_update_participant_status_success(mock_cache, lobby_service, participant_id):
    """Test successful participant status update."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    participant_dict = {
        "status": "waiting",
        "username": "test-username",
        "id": participant_id,
        "color": "#123456",
    }

    mock_cache.get.return_value = participant_dict
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    lobby_service._update_participant_status(
        room.id,
        participant_id,
        status=LobbyParticipantStatus.ACCEPTED,
        timeout=60,
    )

    expected_data = {
        "status": "accepted",
        "username": "test-username",
        "id": participant_id,
        "color": "#123456",
    }
    mock_cache.set.assert_called_once_with(
        "mocked_cache_key", expected_data, timeout=60
    )
    lobby_service._get_cache_key.assert_called_once_with(room.id, participant_id)


def test_clear_room_cache(settings, lobby_service):
    """Test clearing room cache actually removes entries from cache."""

    settings.LOBBY_KEY_PREFIX = "test-lobby"
    settings.LOBBY_WAITING_TIMEOUT = 10000
    settings.LOBBY_ACCEPTED_TIMEOUT = 10000
    settings.LOBBY_DENIED_TIMEOUT = 10000

    room_id = uuid.uuid4()

    cache.set(
        f"test-lobby_{room_id!s}_participant1",
        LobbyParticipant(
            status=LobbyParticipantStatus.WAITING,
            username="participant1",
            id="participant1",
            color="#123456",
        ),
        timeout=settings.LOBBY_WAITING_TIMEOUT,
    )
    cache.set(
        f"test-lobby_{room_id!s}_participant2",
        LobbyParticipant(
            status=LobbyParticipantStatus.ACCEPTED,
            username="participant2",
            id="participant2",
            color="#123456",
        ),
        timeout=settings.LOBBY_ACCEPTED_TIMEOUT,
    )
    cache.set(
        f"test-lobby_{room_id!s}_participant3",
        LobbyParticipant(
            status=LobbyParticipantStatus.DENIED,
            username="participant3",
            id="participant3",
            color="#123456",
        ),
        timeout=settings.LOBBY_DENIED_TIMEOUT,
    )

    lobby_service.clear_room_cache(room_id)

    assert cache.keys(f"test-lobby_{room_id!s}_*") == []


def test_clear_room_empty(settings, lobby_service):
    """Test clearing room cache when it's already empty."""

    settings.LOBBY_KEY_PREFIX = "test-lobby"
    room_id = uuid.uuid4()

    assert cache.keys(f"test-lobby_{room_id!s}_*") == []
    lobby_service.clear_room_cache(room_id)
    assert cache.keys(f"test-lobby_{room_id!s}_*") == []
