"""
Test utils functions
"""

import json
from unittest import mock

import pytest
from livekit.api import TwirpError

from core.utils import NotificationError, create_livekit_client, notify_participants


@mock.patch("asyncio.get_running_loop")
@mock.patch("core.utils.LiveKitAPI")
def test_create_livekit_client_ssl_enabled(
    mock_livekit_api, mock_get_running_loop, settings
):
    """Test LiveKitAPI client creation with SSL verification enabled."""
    mock_get_running_loop.return_value = mock.MagicMock()
    settings.LIVEKIT_VERIFY_SSL = True

    create_livekit_client()

    mock_livekit_api.assert_called_once_with(
        **settings.LIVEKIT_CONFIGURATION, session=None
    )


@mock.patch("core.utils.aiohttp.ClientSession")
@mock.patch("asyncio.get_running_loop")
@mock.patch("core.utils.LiveKitAPI")
def test_create_livekit_client_ssl_disabled(
    mock_livekit_api, mock_get_running_loop, mock_client_session, settings
):
    """Test LiveKitAPI client creation with SSL verification disabled."""
    mock_get_running_loop.return_value = mock.MagicMock()
    mock_session_instance = mock.MagicMock()
    mock_client_session.return_value = mock_session_instance
    settings.LIVEKIT_VERIFY_SSL = False

    create_livekit_client()

    mock_livekit_api.assert_called_once_with(
        **settings.LIVEKIT_CONFIGURATION, session=mock_session_instance
    )


@mock.patch("asyncio.get_running_loop")
@mock.patch("core.utils.LiveKitAPI")
def test_create_livekit_client_custom_configuration(
    mock_livekit_api, mock_get_running_loop, settings
):
    """Test LiveKitAPI client creation with custom configuration."""
    settings.LIVEKIT_VERIFY_SSL = True

    mock_get_running_loop.return_value = mock.MagicMock()
    custom_configuration = {
        "api_key": "mock_key",
        "api_secret": "mock_secret",
        "url": "http://mock-url.com",
    }

    create_livekit_client(custom_configuration)

    mock_livekit_api.assert_called_once_with(**custom_configuration, session=None)


@mock.patch("core.utils.create_livekit_client")
def test_notify_participants_error(mock_create_livekit_client):
    """Test participant notification with API error."""

    # Set up the mock LiveKitAPI and its behavior
    mock_api_instance = mock.Mock()
    mock_api_instance.room = mock.Mock()
    mock_api_instance.room.send_data = mock.AsyncMock(
        side_effect=TwirpError(msg="test error", code=123, status=123)
    )

    class MockResponse:
        """LiveKit API response mock with non-empty rooms list."""

        rooms = ["room-1"]

    mock_api_instance.room.list_rooms = mock.AsyncMock(return_value=MockResponse())

    mock_api_instance.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api_instance

    # Call the function and expect an exception
    with pytest.raises(NotificationError, match="Failed to notify room participants"):
        notify_participants(room_name="room-number-1", notification_data={"foo": "foo"})

    # Verify that the service checked for existing rooms
    mock_api_instance.room.list_rooms.assert_called_once()

    # Verify send_data was called
    mock_api_instance.room.send_data.assert_called_once()

    # Verify aclose was still called after the exception
    mock_api_instance.aclose.assert_called_once()


@mock.patch("core.utils.create_livekit_client")
def test_notify_participants_success_no_room(mock_create_livekit_client):
    """Test the notify_participants function when the LiveKit room doesn't exist."""

    # Set up the mock LiveKitAPI and its behavior
    mock_api_instance = mock.Mock()
    mock_api_instance.room = mock.Mock()
    mock_api_instance.room.send_data = mock.AsyncMock()

    # Create a proper response object with an empty rooms list
    class MockResponse:
        """LiveKit API response mock with empty rooms list."""

        rooms = []

    mock_api_instance.room.list_rooms = mock.AsyncMock(return_value=MockResponse())
    mock_api_instance.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api_instance

    notify_participants(room_name="room-number-1", notification_data={"foo": "foo"})

    # Verify that the service checked for existing rooms
    mock_api_instance.room.list_rooms.assert_called_once()

    # Verify the send_data method was not called since no room exists
    mock_api_instance.room.send_data.assert_not_called()

    # Verify the connection was properly closed
    mock_api_instance.aclose.assert_called_once()


@mock.patch("core.utils.create_livekit_client")
def test_notify_participants_success(mock_create_livekit_client):
    """Test successful participant notification."""

    # Set up the mock LiveKitAPI and its behavior
    mock_api_instance = mock.Mock()
    mock_api_instance.room = mock.Mock()
    mock_api_instance.room.send_data = mock.AsyncMock()

    class MockResponse:
        """LiveKit API response mock with non-empty rooms list."""

        rooms = ["room-1"]

    mock_api_instance.room.list_rooms = mock.AsyncMock(return_value=MockResponse())

    mock_api_instance.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api_instance

    # Call the function
    notify_participants(room_name="room-number-1", notification_data={"foo": "foo"})

    # Verify that the service checked for existing rooms
    mock_api_instance.room.list_rooms.assert_called_once()

    # Verify the send_data method was called
    mock_api_instance.room.send_data.assert_called_once()
    send_data_request = mock_api_instance.room.send_data.call_args[0][0]
    assert send_data_request.room == "room-number-1"
    assert json.loads(send_data_request.data.decode("utf-8")) == {"foo": "foo"}
    assert send_data_request.kind == 0  # RELIABLE mode in Livekit protocol

    # Verify aclose was called
    mock_api_instance.aclose.assert_called_once()
