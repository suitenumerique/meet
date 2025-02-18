"""
Test lobby service.
"""

# pylint: disable=W0621,W0613, W0212, R0913
# ruff: noqa: PLR0913

import json
from unittest import mock
from uuid import UUID

from django.conf import settings
from django.http import HttpResponse

import pytest
from livekit.api import TwirpError

from core.services.lobby_service import (
    LobbyNotificationError,
    LobbyParticipant,
    LobbyParticipantNotFound,
    LobbyParticipantParsingError,
    LobbyParticipantStatus,
    LobbyService,
)


@pytest.fixture
def lobby_service():
    """Return a LobbyService instance."""
    return LobbyService()


@pytest.fixture
def room_id():
    """Return a UUID for test room."""
    return UUID("12345678-1234-5678-1234-567812345678")


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


def test_get_cache_key(lobby_service, room_id, participant_id):
    """Test cache key generation."""
    cache_key = lobby_service._get_cache_key(room_id, participant_id)

    expected_key = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_{participant_id}"
    assert cache_key == expected_key


def test_get_or_create_participant_id_from_cookie(lobby_service):
    """Test extracting participant ID from cookie."""
    request = mock.Mock()
    request.COOKIES = {settings.LOBBY_COOKIE_NAME: "existing-id"}

    participant_id = lobby_service._get_or_create_participant_id(request)

    assert participant_id == "existing-id"


@mock.patch("uuid.uuid4")
def test_get_or_create_participant_id_new(mock_uuid4, lobby_service):
    """Test creating new participant ID when cookie is missing."""
    mock_uuid4.return_value = mock.Mock(hex="generated-id")
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


@mock.patch("core.utils.generate_livekit_config")
def test_request_entry_public_room(
    mock_generate_config, lobby_service, room_id, participant_id, username
):
    """Test requesting entry to a public room."""
    request = mock.Mock()
    request.user = mock.Mock()

    room = mock.Mock()
    room.id = room_id
    room.is_public = True

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
        room_id=str(room_id),
        user=request.user,
        username=username,
        color=participant.color,
    )

    lobby_service._get_participant.assert_called_once_with(room_id, participant_id)


@mock.patch("core.services.lobby_service.LobbyService.enter")
def test_request_entry_new_participant(
    mock_enter, lobby_service, room_id, participant_id, username
):
    """Test requesting entry for a new participant."""
    request = mock.Mock()
    request.COOKIES = {settings.LOBBY_COOKIE_NAME: participant_id}

    room = mock.Mock()
    room.id = room_id
    room.is_public = False

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
    mock_enter.assert_called_once_with(room_id, participant_id, username)
    lobby_service._get_participant.assert_called_once_with(room_id, participant_id)


@mock.patch("core.services.lobby_service.LobbyService.refresh_waiting_status")
def test_request_entry_waiting_participant(
    mock_refresh, lobby_service, room_id, participant_id, username
):
    """Test requesting entry for a waiting participant."""
    request = mock.Mock()
    request.COOKIES = {settings.LOBBY_COOKIE_NAME: participant_id}

    room = mock.Mock()
    room.id = room_id
    room.is_public = False

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
    mock_refresh.assert_called_once_with(room_id, participant_id)
    lobby_service._get_participant.assert_called_once_with(room_id, participant_id)


@mock.patch("core.utils.generate_livekit_config")
def test_request_entry_accepted_participant(
    mock_generate_config, lobby_service, room_id, participant_id, username
):
    """Test requesting entry for an accepted participant."""
    request = mock.Mock()
    request.user = mock.Mock()
    request.COOKIES = {settings.LOBBY_COOKIE_NAME: participant_id}

    room = mock.Mock()
    room.id = room_id
    room.is_public = False

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
        room_id=str(room_id),
        user=request.user,
        username=username,
        color="#123456",
    )
    lobby_service._get_participant.assert_called_once_with(room_id, participant_id)


@mock.patch("core.services.lobby_service.cache")
def test_refresh_waiting_status(mock_cache, lobby_service, room_id, participant_id):
    """Test refreshing waiting status for a participant."""
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")
    lobby_service.refresh_waiting_status(room_id, participant_id)
    mock_cache.touch.assert_called_once_with(
        "mocked_cache_key", settings.LOBBY_WAITING_TIMEOUT
    )


# pylint: disable=R0917
@mock.patch("core.services.lobby_service.cache")
@mock.patch("core.utils.generate_color")
@mock.patch("core.services.lobby_service.LobbyService.notify_participants")
def test_enter_success(
    mock_notify,
    mock_generate_color,
    mock_cache,
    lobby_service,
    room_id,
    participant_id,
    username,
):
    """Test successful participant entry."""
    mock_generate_color.return_value = "#123456"
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    participant = lobby_service.enter(room_id, participant_id, username)

    mock_generate_color.assert_called_once_with(participant_id)
    assert participant.status == LobbyParticipantStatus.WAITING
    assert participant.username == username
    assert participant.id == participant_id
    assert participant.color == "#123456"

    lobby_service._get_cache_key.assert_called_once_with(room_id, participant_id)

    mock_cache.set.assert_called_once_with(
        "mocked_cache_key",
        participant.to_dict(),
        timeout=settings.LOBBY_WAITING_TIMEOUT,
    )
    mock_notify.assert_called_once_with(room_id=room_id)


# pylint: disable=R0917
@mock.patch("core.services.lobby_service.cache")
@mock.patch("core.utils.generate_color")
@mock.patch("core.services.lobby_service.LobbyService.notify_participants")
def test_enter_with_notification_error(
    mock_notify,
    mock_generate_color,
    mock_cache,
    lobby_service,
    room_id,
    participant_id,
    username,
):
    """Test participant entry with notification error."""
    mock_generate_color.return_value = "#123456"
    mock_notify.side_effect = LobbyNotificationError("Error notifying")
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    participant = lobby_service.enter(room_id, participant_id, username)

    mock_generate_color.assert_called_once_with(participant_id)
    assert participant.status == LobbyParticipantStatus.WAITING
    assert participant.username == username

    lobby_service._get_cache_key.assert_called_once_with(room_id, participant_id)

    mock_cache.set.assert_called_once_with(
        "mocked_cache_key",
        participant.to_dict(),
        timeout=settings.LOBBY_WAITING_TIMEOUT,
    )


@mock.patch("core.services.lobby_service.cache")
def test_get_participant_not_found(mock_cache, lobby_service, room_id, participant_id):
    """Test getting a participant that doesn't exist."""
    mock_cache.get.return_value = None
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    result = lobby_service._get_participant(room_id, participant_id)

    assert result is None

    lobby_service._get_cache_key.assert_called_once_with(room_id, participant_id)
    mock_cache.get.assert_called_once_with("mocked_cache_key")


@mock.patch("core.services.lobby_service.cache")
@mock.patch("core.services.lobby_service.LobbyParticipant.from_dict")
def test_get_participant_parsing_error(
    mock_from_dict, mock_cache, lobby_service, room_id, participant_id
):
    """Test handling corrupted participant data."""
    mock_cache.get.return_value = {"some": "data"}
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")
    mock_from_dict.side_effect = LobbyParticipantParsingError("Invalid data")

    result = lobby_service._get_participant(room_id, participant_id)

    assert result is None
    lobby_service._get_cache_key.assert_called_once_with(room_id, participant_id)
    mock_cache.delete.assert_called_once_with("mocked_cache_key")


@mock.patch("core.services.lobby_service.cache")
def test_list_waiting_participants_empty(mock_cache, lobby_service, room_id):
    """Test listing waiting participants when none exist."""
    mock_cache.keys.return_value = []

    result = lobby_service.list_waiting_participants(room_id)

    assert result == []
    pattern = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_*"
    mock_cache.keys.assert_called_once_with(pattern)
    mock_cache.get_many.assert_not_called()


@mock.patch("core.services.lobby_service.cache")
def test_list_waiting_participants(
    mock_cache, lobby_service, room_id, participant_dict
):
    """Test listing waiting participants with valid data."""
    cache_key = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_participant1"
    mock_cache.keys.return_value = [cache_key]
    mock_cache.get_many.return_value = {cache_key: participant_dict}

    result = lobby_service.list_waiting_participants(room_id)

    assert len(result) == 1
    assert result[0]["status"] == "waiting"
    assert result[0]["username"] == "test-username"
    pattern = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_*"
    mock_cache.keys.assert_called_once_with(pattern)
    mock_cache.get_many.assert_called_once_with([cache_key])


@mock.patch("core.services.lobby_service.cache")
def test_list_waiting_participants_multiple(mock_cache, lobby_service, room_id):
    """Test listing multiple waiting participants with valid data."""
    cache_key1 = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_participant1"
    cache_key2 = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_participant2"

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

    result = lobby_service.list_waiting_participants(room_id)

    assert len(result) == 2

    # Verify both participants are in the result
    assert any(p["id"] == "participant1" and p["username"] == "user1" for p in result)
    assert any(p["id"] == "participant2" and p["username"] == "user2" for p in result)

    # Verify all participants have waiting status
    assert all(p["status"] == "waiting" for p in result)

    pattern = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_*"
    mock_cache.keys.assert_called_once_with(pattern)
    mock_cache.get_many.assert_called_once_with([cache_key1, cache_key2])


@mock.patch("core.services.lobby_service.cache")
def test_list_waiting_participants_corrupted_data(mock_cache, lobby_service, room_id):
    """Test listing waiting participants with corrupted data."""
    cache_key = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_participant1"
    mock_cache.keys.return_value = [cache_key]
    mock_cache.get_many.return_value = {cache_key: {"invalid": "data"}}

    result = lobby_service.list_waiting_participants(room_id)

    assert result == []
    mock_cache.delete.assert_called_once_with(cache_key)


@mock.patch("core.services.lobby_service.cache")
def test_list_waiting_participants_partially_corrupted(
    mock_cache, lobby_service, room_id
):
    """Test listing waiting participants with one valid and one corrupted entry."""
    cache_key1 = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_participant1"
    cache_key2 = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_participant2"

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

    result = lobby_service.list_waiting_participants(room_id)

    # Check that only the valid participant is returned
    assert len(result) == 1
    assert result[0]["id"] == "participant2"
    assert result[0]["status"] == "waiting"
    assert result[0]["username"] == "user2"

    # Verify corrupted entry was deleted
    mock_cache.delete.assert_called_once_with(cache_key1)

    # Verify both cache keys were queried
    pattern = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_*"
    mock_cache.keys.assert_called_once_with(pattern)
    mock_cache.get_many.assert_called_once_with([cache_key1, cache_key2])


@mock.patch("core.services.lobby_service.cache")
def test_list_waiting_participants_non_waiting(mock_cache, lobby_service, room_id):
    """Test listing only waiting participants (not accepted/denied)."""
    cache_key1 = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_participant1"
    cache_key2 = f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_participant2"

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

    result = lobby_service.list_waiting_participants(room_id)

    assert len(result) == 1
    assert result[0]["id"] == "participant1"
    assert result[0]["status"] == "waiting"


@mock.patch("core.services.lobby_service.LobbyService._update_participant_status")
def test_handle_participant_entry_allow(
    mock_update, lobby_service, room_id, participant_id
):
    """Test handling allowed participant entry."""
    lobby_service.handle_participant_entry(room_id, participant_id, allow_entry=True)

    mock_update.assert_called_once_with(
        room_id,
        participant_id,
        status=LobbyParticipantStatus.ACCEPTED,
        timeout=settings.LOBBY_ACCEPTED_TIMEOUT,
    )


@mock.patch("core.services.lobby_service.LobbyService._update_participant_status")
def test_handle_participant_entry_deny(
    mock_update, lobby_service, room_id, participant_id
):
    """Test handling denied participant entry."""
    lobby_service.handle_participant_entry(room_id, participant_id, allow_entry=False)

    mock_update.assert_called_once_with(
        room_id,
        participant_id,
        status=LobbyParticipantStatus.DENIED,
        timeout=settings.LOBBY_DENIED_TIMEOUT,
    )


@mock.patch("core.services.lobby_service.cache")
def test_update_participant_status_not_found(
    mock_cache, lobby_service, room_id, participant_id
):
    """Test updating status for non-existent participant."""
    mock_cache.get.return_value = None
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    with pytest.raises(LobbyParticipantNotFound, match="Participant not found"):
        lobby_service._update_participant_status(
            room_id,
            participant_id,
            status=LobbyParticipantStatus.ACCEPTED,
            timeout=60,
        )

    lobby_service._get_cache_key.assert_called_once_with(room_id, participant_id)
    mock_cache.get.assert_called_once_with("mocked_cache_key")


@mock.patch("core.services.lobby_service.cache")
@mock.patch("core.services.lobby_service.LobbyParticipant.from_dict")
def test_update_participant_status_corrupted_data(
    mock_from_dict, mock_cache, lobby_service, room_id, participant_id
):
    """Test updating status with corrupted participant data."""
    mock_cache.get.return_value = {"some": "data"}
    mock_from_dict.side_effect = LobbyParticipantParsingError("Invalid data")
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    with pytest.raises(LobbyParticipantParsingError):
        lobby_service._update_participant_status(
            room_id,
            participant_id,
            status=LobbyParticipantStatus.ACCEPTED,
            timeout=60,
        )

    mock_cache.delete.assert_called_once_with("mocked_cache_key")
    lobby_service._get_cache_key.assert_called_once_with(room_id, participant_id)


@mock.patch("core.services.lobby_service.cache")
def test_update_participant_status_success(
    mock_cache, lobby_service, room_id, participant_id
):
    """Test successful participant status update."""
    participant_dict = {
        "status": "waiting",
        "username": "test-username",
        "id": participant_id,
        "color": "#123456",
    }

    mock_cache.get.return_value = participant_dict
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    lobby_service._update_participant_status(
        room_id,
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
    lobby_service._get_cache_key.assert_called_once_with(room_id, participant_id)


@mock.patch("core.services.lobby_service.LiveKitAPI")
def test_notify_participants_success(mock_livekit_api, lobby_service, room_id):
    """Test successful participant notification."""
    # Set up the mock LiveKitAPI and its behavior
    mock_api_instance = mock.Mock()
    mock_api_instance.room = mock.Mock()
    mock_api_instance.room.send_data = mock.AsyncMock()
    mock_api_instance.aclose = mock.AsyncMock()
    mock_livekit_api.return_value = mock_api_instance

    # Call the function
    lobby_service.notify_participants(room_id)

    # Verify the API was called correctly
    mock_livekit_api.assert_called_once_with(**settings.LIVEKIT_CONFIGURATION)

    # Verify the send_data method was called
    mock_api_instance.room.send_data.assert_called_once()
    send_data_request = mock_api_instance.room.send_data.call_args[0][0]
    assert send_data_request.room == str(room_id)
    assert (
        json.loads(send_data_request.data.decode("utf-8"))["type"]
        == settings.LOBBY_NOTIFICATION_TYPE
    )
    assert send_data_request.kind == 0  # RELIABLE mode in Livekit protocol

    # Verify aclose was called
    mock_api_instance.aclose.assert_called_once()


@mock.patch("core.services.lobby_service.LiveKitAPI")
def test_notify_participants_error(mock_livekit_api, lobby_service, room_id):
    """Test participant notification with API error."""
    # Set up the mock LiveKitAPI and its behavior
    mock_api_instance = mock.Mock()
    mock_api_instance.room = mock.Mock()
    mock_api_instance.room.send_data = mock.AsyncMock(
        side_effect=TwirpError(msg="test error", code=123)
    )
    mock_api_instance.aclose = mock.AsyncMock()
    mock_livekit_api.return_value = mock_api_instance

    # Call the function and expect an exception
    with pytest.raises(
        LobbyNotificationError, match="Failed to notify room participants"
    ):
        lobby_service.notify_participants(room_id)

    # Verify the API was called correctly
    mock_livekit_api.assert_called_once_with(**settings.LIVEKIT_CONFIGURATION)

    # Verify send_data was called
    mock_api_instance.room.send_data.assert_called_once()

    # Verify aclose was still called after the exception
    mock_api_instance.aclose.assert_called_once()
