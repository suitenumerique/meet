"""
Test utils functions
"""

# pylint: disable=W0621
import json
import socket
import threading
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import AnonymousUser

import jwt
import pytest
from asgiref.sync import async_to_sync
from livekit.api import TwirpError

from core.factories import UserFactory
from core.services.room_management import RoomManagement
from core.utils import (
    NotificationError,
    create_livekit_client,
    generate_token,
    notify_participants,
)

pytestmark = pytest.mark.django_db


def decode_token(token: str) -> dict:
    """Decode a LiveKit JWT access token for inspection."""
    return jwt.decode(
        token,
        settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
    )


def test_generate_token_authenticated_uses_full_name():
    """The token's display name should default to the user's full name."""
    user = UserFactory(full_name="Jane Doe")

    token = generate_token(room="my-room", user=user)

    claims = decode_token(token)
    assert claims["name"] == "Jane Doe"
    assert claims["sub"] == str(user.sub)


def test_generate_token_authenticated_fallback_user_representation():
    """
    When the user has no full name, the token's display name should fall back
    to the user's string representation.
    """
    user = UserFactory(full_name=None)

    token = generate_token(room="my-room", user=user)

    claims = decode_token(token)
    assert claims["name"] == str(user)


def test_generate_token_explicit_username_overrides_default():
    """An explicitly provided username should take precedence over the full name."""
    user = UserFactory(full_name="Jane Doe")

    token = generate_token(room="my-room", user=user, username="Custom Name")

    claims = decode_token(token)
    assert claims["name"] == "Custom Name"


def test_authenticated_username_ignored_when_editing_disabled(settings):
    """With editing disabled, an authenticated user's username is ignored."""
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False
    user = UserFactory(full_name="Jane Doe")
    token = generate_token(room="my-room", user=user, username="Custom Name")
    claims = decode_token(token)
    assert claims["name"] == "Jane Doe"


def test_authenticated_default_name_unaffected_when_editing_disabled(settings):
    """Disabling editing doesn't disturb the default full-name path."""
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False
    user = UserFactory(full_name="Jane Doe")
    token = generate_token(room="my-room", user=user)
    claims = decode_token(token)
    assert claims["name"] == "Jane Doe"


def test_anonymous_uses_username_when_provided():
    """An anonymous user's provided username is used as the display name."""
    token = generate_token(room="my-room", user=AnonymousUser(), username="Guest42")
    claims = decode_token(token)
    assert claims["name"] == "Guest42"


def test_anonymous_username_used_even_when_editing_disabled(settings):
    """The setting governs authenticated users only; anonymous can still set a name."""
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False
    token = generate_token(room="my-room", user=AnonymousUser(), username="Guest42")
    claims = decode_token(token)
    assert claims["name"] == "Guest42"


def test_anonymous_falls_back_to_anonymous_label():
    """With no username, an anonymous user is labelled 'Anonymous'."""
    token = generate_token(room="my-room", user=AnonymousUser())
    claims = decode_token(token)
    assert claims["name"] == "Anonymous"


@pytest.fixture
def fake_livekit(request):
    """A LiveKit address that takes the connection, sends `request.param`, then waits."""
    server = socket.create_server(("127.0.0.1", 0))
    held = []

    def accept():
        while True:
            try:
                connection, _ = server.accept()
            except OSError:
                return
            held.append(connection)
            connection.sendall(request.param)

    threading.Thread(target=accept, daemon=True).start()
    yield f"http://127.0.0.1:{server.getsockname()[1]:d}"
    server.close()
    for connection in held:
        connection.close()


@pytest.mark.parametrize(
    "fake_livekit",
    [b"", b"HTTP/1.1 200 OK\r\nContent-Length: 64\r\n\r\n"],
    ids=["no answer", "answer cut short"],
    indirect=True,
)
def test_create_livekit_client_gives_up_on_a_quiet_livekit(fake_livekit, settings):
    """A LiveKit that stops answering fails the call after the timeout."""
    settings.LIVEKIT_CONFIGURATION = {
        **settings.LIVEKIT_CONFIGURATION,
        "url": fake_livekit,
    }
    settings.LIVEKIT_API_TIMEOUT_SECONDS = 1

    raised = []

    def delete_room():
        try:
            RoomManagement.delete_room("room-abc")
        except TimeoutError as error:
            raised.append(error)

    # A thread, so a call that never gives up fails the test rather than hangs it.
    call = threading.Thread(target=delete_room, daemon=True)
    call.start()
    call.join(5)

    assert not call.is_alive()
    assert len(raised) == 1


@pytest.mark.parametrize(
    "fake_livekit",
    [b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n"],
    ids=["answer"],
    indirect=True,
)
def test_create_livekit_client_lets_an_answer_through(fake_livekit, settings):
    """A LiveKit that answers within the timeout is not cut off."""
    settings.LIVEKIT_CONFIGURATION = {
        **settings.LIVEKIT_CONFIGURATION,
        "url": fake_livekit,
    }
    settings.LIVEKIT_API_TIMEOUT_SECONDS = 1

    RoomManagement.delete_room("room-abc")


@pytest.mark.parametrize("verify_ssl", [True, False])
def test_create_livekit_client_closes_its_session(verify_ssl, settings):
    """Closing the client closes its session, whether SSL is verified or not."""
    settings.LIVEKIT_VERIFY_SSL = verify_ssl

    @async_to_sync
    async def open_and_close():
        client = create_livekit_client()
        await client.aclose()
        return client._session  # pylint: disable=protected-access

    session = open_and_close()

    assert session.closed
    assert session.connector is None


@pytest.mark.parametrize("verify_ssl", [True, False])
def test_create_livekit_client_ssl(verify_ssl, settings):
    """SSL is verified unless the setting turns it off."""
    settings.LIVEKIT_VERIFY_SSL = verify_ssl

    @async_to_sync
    async def ssl_of_new_client():
        client = create_livekit_client()
        ssl = client._session.connector._ssl  # pylint: disable=protected-access
        await client.aclose()
        return ssl

    assert (ssl_of_new_client() is not False) is verify_ssl


def test_create_livekit_client_custom_configuration():
    """A custom configuration picks the LiveKit the client talks to."""

    @async_to_sync
    async def url_of_new_client():
        client = create_livekit_client(
            {"api_key": "key", "api_secret": "secret", "url": "http://mock-url.com"}
        )
        url = client.room._client.host  # pylint: disable=protected-access
        await client.aclose()
        return url

    assert url_of_new_client().startswith("http://mock-url.com")


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
