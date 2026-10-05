"""Tests for the RoomManagement service."""

# pylint: disable=no-name-in-module

from unittest import mock

import pytest
from livekit.api import ListRoomsResponse, Room, TwirpError

from core.factories import RoomFactory
from core.models import RoomAccessLevel
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)


def _mock_list_rooms(mock_create_livekit_client, **kwargs):
    """Make the mocked LiveKit client answer ListRooms."""
    mock_api = mock.MagicMock()
    mock_api.room.list_rooms = mock.AsyncMock(**kwargs)
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api
    return mock_api


@pytest.mark.parametrize(
    "max_participants,num_participants,expected",
    [
        (0, 500, False),
        (150, 149, False),
        (150, 150, True),
        (150, 151, True),
    ],
)
@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_compares_participants_to_limit(
    mock_create_livekit_client, max_participants, num_participants, expected
):
    """A room is full once its participants reach a non-zero limit."""
    mock_api = _mock_list_rooms(
        mock_create_livekit_client,
        return_value=ListRoomsResponse(
            rooms=[
                Room(
                    name="room-abc",
                    max_participants=max_participants,
                    num_participants=num_participants,
                )
            ]
        ),
    )

    assert RoomManagement.is_full("room-abc") is expected

    request = mock_api.room.list_rooms.await_args.args[0]
    assert list(request.names) == ["room-abc"]
    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_room_not_live(mock_create_livekit_client):
    """A room LiveKit does not know is not full."""
    _mock_list_rooms(mock_create_livekit_client, return_value=ListRoomsResponse())

    assert RoomManagement.is_full("room-abc") is False


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_raises_management_exception(mock_create_livekit_client):
    """Twirp errors raise RoomManagementException."""
    mock_api = _mock_list_rooms(
        mock_create_livekit_client,
        side_effect=TwirpError("internal", "boom", status=500),
    )

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
