"""Tests for the RoomManagement service."""

from unittest import mock

import aiohttp
import pytest
from livekit.api import TwirpError
from livekit.protocol.models import Room as LiveKitRoom
from livekit.protocol.room import ListRoomsResponse

from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_delete_room_calls_livekit(mock_create_livekit_client):
    """DeleteRoom is forwarded to the LiveKit API."""
    mock_api = mock.MagicMock()
    mock_api.room.delete_room = mock.AsyncMock()
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    RoomManagement().delete_room("room-abc")

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
        RoomManagement().delete_room("missing-room")

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
        RoomManagement().delete_room("room-abc")

    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_get_participants_count_reads_livekit(mock_create_livekit_client):
    """The count is the one LiveKit reports for the room."""
    mock_api = mock.MagicMock()
    mock_api.room.list_rooms = mock.AsyncMock(
        return_value=ListRoomsResponse(
            rooms=[LiveKitRoom(name="room-abc", num_participants=3)]
        )
    )
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    assert RoomManagement().get_participants_count("room-abc") == 3

    request = mock_api.room.list_rooms.await_args.args[0]
    assert list(request.names) == ["room-abc"]
    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_get_participants_count_of_a_room_livekit_does_not_know(
    mock_create_livekit_client,
):
    """A room LiveKit has never created has nobody in it."""
    mock_api = mock.MagicMock()
    mock_api.room.list_rooms = mock.AsyncMock(return_value=ListRoomsResponse(rooms=[]))
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    assert RoomManagement().get_participants_count("room-abc") == 0

    mock_api.aclose.assert_awaited_once()


@pytest.mark.parametrize(
    "error",
    [
        TwirpError("internal", "boom", status=500),
        aiohttp.ClientConnectorError(mock.Mock(), OSError("connection refused")),
    ],
)
@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_get_participants_count_raises_management_exception(
    mock_create_livekit_client, error
):
    """A refusal and an unreachable server both fail the same way."""
    mock_api = mock.MagicMock()
    mock_api.room.list_rooms = mock.AsyncMock(side_effect=error)
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    with pytest.raises(RoomManagementException):
        RoomManagement().get_participants_count("room-abc")

    mock_api.aclose.assert_awaited_once()
