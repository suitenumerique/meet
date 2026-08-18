"""
Test lobby service.
"""

# pylint: disable=W0621,W0613, W0212, R0913

import uuid
from unittest import mock

from django.conf import settings as django_settings
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache

import pytest

from core.factories import RoomFactory, UserFactory, UserResourceAccessFactory
from core.models import RoleChoices, RoomAccessLevel
from core.services.lobby import (
    LobbyParticipant,
    LobbyParticipantNotFound,
    LobbyParticipantParsingError,
    LobbyParticipantStatus,
    LobbyService,
)
from core.services.presence import CACHE_SCAN_ITERSIZE
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

    expected_key = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_{participant_id}"
    assert cache_key == expected_key


def test_can_bypass_lobby_public_room(lobby_service):
    """Should return True for public rooms regardless of user auth and role."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    # Anonymous user
    user = mock.Mock()
    user.is_authenticated = False
    assert lobby_service.can_bypass_lobby(room, user, role=None) is True

    # Authenticated user
    user.is_authenticated = True
    assert lobby_service.can_bypass_lobby(room, user, role=None) is True


def test_can_bypass_lobby_trusted_room_authenticated(lobby_service):
    """Should return True for trusted rooms with authenticated users."""
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)

    # Authenticated user
    user = mock.Mock()
    user.is_authenticated = True
    assert lobby_service.can_bypass_lobby(room, user, role=None) is True


def test_can_bypass_lobby_trusted_room_anonymous(lobby_service):
    """Should return False for trusted rooms with anonymous users."""
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)

    # Anonymous user
    user = mock.Mock()
    user.is_authenticated = False
    assert lobby_service.can_bypass_lobby(room, user, role=None) is False


def test_can_bypass_lobby_private_room(lobby_service):
    """Should return False for private rooms regardless of user auth if role is not."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    # Anonymous user
    user = mock.Mock()
    user.is_authenticated = False
    assert lobby_service.can_bypass_lobby(room, user, role=None) is False

    # Authenticated user
    user.is_authenticated = True
    assert lobby_service.can_bypass_lobby(room, user, role=None) is False


@pytest.mark.parametrize(
    "role",
    [RoleChoices.MEMBER, RoleChoices.ADMIN, RoleChoices.OWNER],
)
def test_can_bypass_lobby_private_room_with_any_role(role, lobby_service):
    """Should return True for private rooms if the user is authenticated and has any role."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    user = mock.Mock()
    user.is_authenticated = True
    assert lobby_service.can_bypass_lobby(room, user, role=role) is True


@mock.patch("core.utils.generate_livekit_config")
def test_request_entry_public_room(
    mock_generate_config, lobby_service, participant_id, username, settings
):
    """Test requesting entry to a public room."""
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    user = AnonymousUser()

    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    cache.set(
        f"mocked-cache-prefix_{room.id}_{participant_id}",
        {
            "id": participant_id,
            "username": username,
            "status": "waiting",
            "color": "#123456",
        },
    )

    mock_generate_config.return_value = {"token": "test-token"}

    participant, livekit_config = lobby_service.request_entry(
        room, user, username, participant_id=participant_id
    )

    assert participant.status == LobbyParticipantStatus.ACCEPTED
    assert livekit_config == {"token": "test-token"}
    mock_generate_config.assert_called_once_with(
        room_id=str(room.id),
        user=user,
        username=username,
        color=participant.color,
        configuration=room.configuration,
        participant_id=participant_id,
        role=None,
    )


@mock.patch("core.utils.generate_livekit_config")
def test_request_entry_trusted_room(
    mock_generate_config, lobby_service, participant_id, username, settings
):
    """Test requesting entry to a trusted room when the user is authenticated."""
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    user = UserFactory()

    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)

    cache.set(
        f"mocked-cache-prefix_{room.id}_{participant_id}",
        {
            "id": participant_id,
            "username": username,
            "status": "waiting",
            "color": "#123456",
        },
    )

    mock_generate_config.return_value = {"token": "test-token"}

    participant, livekit_config = lobby_service.request_entry(
        room, user, username, participant_id=participant_id
    )

    assert participant.status == LobbyParticipantStatus.ACCEPTED
    assert livekit_config == {"token": "test-token"}
    mock_generate_config.assert_called_once_with(
        room_id=str(room.id),
        user=user,
        username=username,
        color=participant.color,
        configuration=room.configuration,
        participant_id=participant_id,
        role=None,
    )


@mock.patch("core.services.lobby.LobbyService._notify_entry_request")
@mock.patch("core.services.lobby.LobbyService._create_participant")
def test_request_entry_new_participant(
    mock_create, mock_notify, lobby_service, participant_id, username
):
    """A new participant gets a server-minted identifier - any provided
    one is unknown to the lobby and therefore discarded - and the room is
    notified of the entry request."""

    user = AnonymousUser()

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    lobby_service._get_participant = mock.Mock(return_value=None)

    participant_data = LobbyParticipant(
        status=LobbyParticipantStatus.WAITING,
        username=username,
        id=participant_id,
        color="#123456",
    )
    mock_create.return_value = participant_data

    forged_id = str(uuid.uuid4())
    participant, livekit_config = lobby_service.request_entry(
        room, user, username, participant_id=forged_id
    )

    assert participant == participant_data
    assert livekit_config is None
    # The provided identifier was looked up, found unknown, and replaced
    # by a freshly minted participant
    lobby_service._get_participant.assert_called_once_with(room.id, forged_id)
    mock_create.assert_called_once_with(room.id, username)
    mock_notify.assert_called_once_with(str(room.id))


@mock.patch("core.services.lobby.LobbyService.refresh_waiting_status")
def test_request_entry_waiting_participant(
    mock_refresh, lobby_service, participant_id, username
):
    """Test requesting entry for a waiting participant."""
    user = AnonymousUser()

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    mocked_participant = LobbyParticipant(
        status=LobbyParticipantStatus.WAITING,
        username=username,
        id=participant_id,
        color="#123456",
    )
    lobby_service._get_participant = mock.Mock(return_value=mocked_participant)

    participant, livekit_config = lobby_service.request_entry(
        room, user, username, participant_id=participant_id
    )

    assert participant.status == LobbyParticipantStatus.WAITING
    assert livekit_config is None
    mock_refresh.assert_called_once_with(room.id, participant_id)
    lobby_service._get_participant.assert_called_once_with(room.id, participant_id)


@mock.patch("core.utils.generate_livekit_config")
def test_request_entry_accepted_participant(
    mock_generate_config, lobby_service, participant_id, username, settings
):
    """Test requesting entry for an accepted participant."""
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"
    user = AnonymousUser()

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    cache.set(
        f"mocked-cache-prefix_{room.id}_{participant_id}",
        {
            "id": participant_id,
            "username": username,
            "status": "accepted",
            "color": "#123456",
        },
    )

    mock_generate_config.return_value = {"token": "test-token"}

    participant, livekit_config = lobby_service.request_entry(
        room, user, username, participant_id=participant_id
    )

    assert participant.status == LobbyParticipantStatus.ACCEPTED
    assert livekit_config == {"token": "test-token"}
    mock_generate_config.assert_called_once_with(
        room_id=str(room.id),
        user=user,
        username=username,
        color="#123456",
        configuration=room.configuration,
        participant_id="test-participant-id",
        role=None,
    )


@mock.patch("core.utils.generate_livekit_config")
def test_request_entry_accepted_participant_username_is_bound(
    mock_generate_config, lobby_service, participant_id, settings
):
    """An accepted identifier must join under the username the host accepted.

    The participant identifier is a bearer value: a stolen or replayed
    identifier must not be able to enter the room under a different
    display name than the one the acceptance decision was made on.
    """
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"
    user = AnonymousUser()

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    cache.set(
        f"mocked-cache-prefix_{room.id}_{participant_id}",
        {
            "id": participant_id,
            "username": "accepted-name",
            "status": "accepted",
            "color": "#123456",
        },
    )

    mock_generate_config.return_value = {"token": "test-token"}

    participant, livekit_config = lobby_service.request_entry(
        room, user, "spoofed-name", participant_id=participant_id
    )

    assert participant.status == LobbyParticipantStatus.ACCEPTED
    assert livekit_config == {"token": "test-token"}
    assert mock_generate_config.call_args.kwargs["username"] == "accepted-name"


@mock.patch("core.utils.generate_livekit_config")
def test_request_entry_participant_with_role(
    mock_generate_config, lobby_service, participant_id, username, settings
):
    """Test requesting entry for a participant with a role on the room."""
    settings.LOBBY_KEY_PREFIX = "mocked-cache-prefix"

    user = UserFactory()

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    UserResourceAccessFactory(resource=room, user=user, role="administrator")

    cache.set(
        f"mocked-cache-prefix_{room.id}_{participant_id}",
        {
            "id": participant_id,
            "username": username,
            "status": "accepted",
            "color": "#123456",
        },
    )

    mock_generate_config.return_value = {"token": "test-token"}

    participant, livekit_config = lobby_service.request_entry(
        room, user, username, participant_id=participant_id
    )

    assert participant.status == LobbyParticipantStatus.ACCEPTED
    assert livekit_config == {"token": "test-token"}
    mock_generate_config.assert_called_once_with(
        room_id=str(room.id),
        user=user,
        username=username,
        color="#123456",
        configuration=room.configuration,
        participant_id="test-participant-id",
        role="administrator",
    )


@mock.patch("core.services.lobby.cache")
def test_refresh_waiting_status(mock_cache, lobby_service, participant_id):
    """Test refreshing waiting status for a participant."""
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    lobby_service.refresh_waiting_status(room.id, participant_id)
    mock_cache.touch.assert_called_once_with(
        "mocked_cache_key", django_settings.LOBBY_WAITING_TIMEOUT
    )


@mock.patch("core.services.lobby.cache")
@mock.patch("core.utils.generate_color")
def test_create_participant(
    mock_generate_color,
    mock_cache,
    lobby_service,
    username,
):
    """A created participant is waiting, colored, and persisted."""
    mock_generate_color.return_value = "#123456"
    lobby_service._get_cache_key = mock.Mock(return_value="mocked_cache_key")

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    participant = lobby_service._create_participant(room.id, username)

    # The identifier is minted server-side
    uuid.UUID(participant.id)
    mock_generate_color.assert_called_once_with(participant.id)
    assert participant.status == LobbyParticipantStatus.WAITING
    assert participant.username == username
    assert participant.color == "#123456"

    lobby_service._get_cache_key.assert_called_once_with(room.id, participant.id)

    mock_cache.set.assert_called_once_with(
        "mocked_cache_key",
        participant.to_dict(),
        timeout=django_settings.LOBBY_WAITING_TIMEOUT,
    )


@mock.patch("core.utils.notify_participants")
def test_notify_entry_request_with_notification_error(mock_notify, lobby_service):
    """A notification error must not break the entry request flow."""
    mock_notify.side_effect = NotificationError("Error notifying")

    lobby_service._notify_entry_request("room-id")

    mock_notify.assert_called_once_with(
        room_name="room-id", notification_data={"type": "participantWaiting"}
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
    mock_cache.iter_keys.return_value = []

    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    result = lobby_service.list_waiting_participants(room.id)

    assert result == []
    pattern = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_*"
    mock_cache.iter_keys.assert_called_once_with(pattern, itersize=CACHE_SCAN_ITERSIZE)
    mock_cache.get_many.assert_not_called()


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants(mock_cache, lobby_service, participant_dict):
    """Test listing waiting participants with valid data."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant1"
    mock_cache.iter_keys.return_value = [cache_key]
    mock_cache.get_many.return_value = {cache_key: participant_dict}

    result = lobby_service.list_waiting_participants(room.id)

    assert len(result) == 1
    assert result[0]["status"] == "waiting"
    assert result[0]["username"] == "test-username"
    pattern = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_*"
    mock_cache.iter_keys.assert_called_once_with(pattern, itersize=CACHE_SCAN_ITERSIZE)
    mock_cache.get_many.assert_called_once_with([cache_key])


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants_multiple(mock_cache, lobby_service):
    """Test listing multiple waiting participants with valid data."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key1 = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant1"
    cache_key2 = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant2"

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

    mock_cache.iter_keys.return_value = [cache_key1, cache_key2]
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

    pattern = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_*"
    mock_cache.iter_keys.assert_called_once_with(pattern, itersize=CACHE_SCAN_ITERSIZE)
    mock_cache.get_many.assert_called_once_with([cache_key1, cache_key2])


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants_corrupted_data(mock_cache, lobby_service):
    """Test listing waiting participants with corrupted data."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant1"
    mock_cache.iter_keys.return_value = [cache_key]
    mock_cache.get_many.return_value = {cache_key: {"invalid": "data"}}

    result = lobby_service.list_waiting_participants(room.id)

    assert result == []
    mock_cache.delete.assert_called_once_with(cache_key)


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants_partially_corrupted(mock_cache, lobby_service):
    """Test listing waiting participants with one valid and one corrupted entry."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key1 = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant1"
    cache_key2 = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant2"

    valid_participant = {
        "status": "waiting",
        "username": "user2",
        "id": "participant2",
        "color": "#654321",
    }

    corrupted_participant = {"invalid": "data"}

    mock_cache.iter_keys.return_value = [cache_key1, cache_key2]
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
    pattern = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_*"
    mock_cache.iter_keys.assert_called_once_with(pattern, itersize=CACHE_SCAN_ITERSIZE)
    mock_cache.get_many.assert_called_once_with([cache_key1, cache_key2])


@mock.patch("core.services.lobby.cache")
def test_list_waiting_participants_non_waiting(mock_cache, lobby_service):
    """Test listing only waiting participants (not accepted/denied)."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    cache_key1 = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant1"
    cache_key2 = f"{django_settings.LOBBY_KEY_PREFIX}_{room.id!s}_participant2"

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

    mock_cache.iter_keys.return_value = [cache_key1, cache_key2]
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
        timeout=django_settings.LOBBY_ACCEPTED_TIMEOUT,
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
        timeout=django_settings.LOBBY_DENIED_TIMEOUT,
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


def test_clear_participant_cache(lobby_service):
    """Test clearing a specific participant entry from cache."""
    room_id = uuid.uuid4()
    participant_id = "test-participant-id"

    cache_key = f"{django_settings.LOBBY_KEY_PREFIX}_{room_id!s}_{participant_id}"
    participant_data = {
        "status": "waiting",
        "username": "test-username",
        "id": participant_id,
        "color": "#123456",
    }
    cache.set(
        cache_key, participant_data, timeout=django_settings.LOBBY_WAITING_TIMEOUT
    )
    assert cache.get(cache_key) is not None

    lobby_service.clear_participant_cache(room_id, participant_id)
    assert cache.get(cache_key) is None


def test_clear_participant_cache_nonexistent(lobby_service):
    """Test clearing a participant that doesn't exist in cache."""
    room_id = uuid.uuid4()
    participant_id = "nonexistent-participant"

    cache_key = f"{django_settings.LOBBY_KEY_PREFIX}_{room_id!s}_{participant_id}"
    assert cache.get(cache_key) is None

    lobby_service.clear_participant_cache(room_id, participant_id)

    assert cache.get(cache_key) is None
