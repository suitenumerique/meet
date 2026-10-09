"""Tests for the RoomManagement service."""

# pylint: disable=no-name-in-module

from unittest import mock

import aiohttp
import pytest
from livekit.api import (
    ListParticipantsResponse,
    ListRoomsResponse,
    ParticipantInfo,
    ParticipantPermission,
    Room,
    TwirpError,
)

from core.factories import RoomFactory
from core.models import RoomAccessLevel
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)


def _mock_room(mock_create_livekit_client, rooms, participants=()):
    """Make the mocked LiveKit client answer ListRooms and ListParticipants."""
    mock_api = mock.MagicMock()
    mock_api.room.list_rooms = mock.AsyncMock(
        return_value=ListRoomsResponse(rooms=rooms)
    )
    mock_api.room.list_participants = mock.AsyncMock(
        return_value=ListParticipantsResponse(participants=list(participants))
    )
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api
    return mock_api


def _people(count, **kwargs):
    return [ParticipantInfo(identity=f"p{i}", **kwargs) for i in range(count)]


@pytest.mark.parametrize(
    "max_participants,people,expected",
    [
        (150, 149, False),
        (150, 150, True),
        (150, 151, True),
    ],
)
@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_compares_participants_to_limit(
    mock_create_livekit_client, max_participants, people, expected
):
    """A room is full once the people in it reach its limit."""
    mock_api = _mock_room(
        mock_create_livekit_client,
        rooms=[Room(name="room-abc", max_participants=max_participants)],
        participants=_people(people),
    )

    assert RoomManagement.is_full("room-abc") is expected

    assert list(mock_api.room.list_rooms.await_args.args[0].names) == ["room-abc"]
    assert mock_api.room.list_participants.await_args.args[0].room == "room-abc"
    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_counts_the_list_not_the_lagging_room_count(
    mock_create_livekit_client,
):
    """A join the room's num_participants has not caught up with still counts."""
    _mock_room(
        mock_create_livekit_client,
        rooms=[Room(name="room-abc", max_participants=3, num_participants=1)],
        participants=_people(3),
    )

    assert RoomManagement.is_full("room-abc") is True


@pytest.mark.parametrize(
    "dependent",
    [
        {"kind": ParticipantInfo.Kind.EGRESS},
        {"kind": ParticipantInfo.Kind.AGENT},
        {"permission": ParticipantPermission(recorder=True)},
        {"permission": ParticipantPermission(agent=True)},
    ],
)
@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_leaves_out_recorders_and_agents(mock_create_livekit_client, dependent):
    """Recorders and agents do not take a seat, as in LiveKit's own join check."""
    _mock_room(
        mock_create_livekit_client,
        rooms=[Room(name="room-abc", max_participants=2)],
        participants=_people(1) + [ParticipantInfo(identity="bot", **dependent)],
    )

    assert RoomManagement.is_full("room-abc") is False


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_without_limit(mock_create_livekit_client):
    """A room with no limit is never full, and its participants are not listed."""
    mock_api = _mock_room(
        mock_create_livekit_client, rooms=[Room(name="room-abc", max_participants=0)]
    )

    assert RoomManagement.is_full("room-abc") is False
    mock_api.room.list_participants.assert_not_awaited()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_room_not_live(mock_create_livekit_client):
    """A room LiveKit does not know is not full."""
    _mock_room(mock_create_livekit_client, rooms=[])

    assert RoomManagement.is_full("room-abc") is False


@pytest.mark.parametrize(
    "error",
    [
        TwirpError("internal", "boom", status=500),
        aiohttp.ClientConnectionError("connection refused"),
    ],
)
@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_raises_management_exception(mock_create_livekit_client, error):
    """Twirp and connection errors raise RoomManagementException."""
    mock_api = _mock_room(mock_create_livekit_client, rooms=[])
    mock_api.room.list_rooms.side_effect = error

    with pytest.raises(RoomManagementException):
        RoomManagement.is_full("room-abc")

    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_delete_room_calls_livekit(mock_create_livekit_client):
    """DeleteRoom is forwarded to the LiveKit API."""
    mock_api = mock.MagicMock()
    mock_api.room.delete_room = mock.AsyncMock()
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    RoomManagement.delete_room("room-abc")

    mock_api.room.delete_room.assert_awaited_once()
    request = mock_api.room.delete_room.await_args.args[0]
    assert request.room == "room-abc"
    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_delete_room_raises_not_found(mock_create_livekit_client):
    """Missing rooms raise RoomNotFoundException."""
    mock_api = mock.MagicMock()
    mock_api.room.delete_room = mock.AsyncMock(
        side_effect=TwirpError("not_found", "room not found", status=404)
    )
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    with pytest.raises(RoomNotFoundException):
        RoomManagement.delete_room("missing-room")

    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_delete_room_raises_management_exception(mock_create_livekit_client):
    """Unexpected Twirp errors raise RoomManagementException."""
    mock_api = mock.MagicMock()
    mock_api.room.delete_room = mock.AsyncMock(
        side_effect=TwirpError("internal", "boom", status=500)
    )
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    with pytest.raises(RoomManagementException):
        RoomManagement.delete_room("room-abc")

    mock_api.aclose.assert_awaited_once()


@mock.patch.object(RoomManagement, "update_metadata")
def test_sync_room_metadata_pushes_configuration_and_access_level(mock_update_metadata):
    """The room's configuration and access level are forwarded to LiveKit."""
    room = RoomFactory.build(
        access_level=RoomAccessLevel.RESTRICTED,
        configuration={"everyone_can_mute": True},
    )

    RoomManagement.sync_room_metadata(room)

    mock_update_metadata.assert_called_once_with(
        room_name=str(room.id),
        metadata={
            "configuration": {"everyone_can_mute": True},
            "access_level": RoomAccessLevel.RESTRICTED,
        },
    )
