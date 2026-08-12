"""
Test utils functions
"""

# pylint: disable=W0621
import json
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import AnonymousUser

import jwt
import pytest
from livekit.api import TwirpError
from livekit.protocol.models import ParticipantInfo

from core.factories import UserFactory
from core.utils import (
    MAX_DISPLAY_NAME_BYTES,
    MAX_DISPLAY_NAME_CHARACTERS,
    NotificationError,
    create_livekit_client,
    generate_join_config,
    generate_token,
    list_participant_names,
    notify_participants,
    resolve_display_name,
    unique_display_name,
)

pytestmark = pytest.mark.django_db


def decode_token(token: str) -> dict:
    """Decode a LiveKit JWT access token for inspection."""
    return jwt.decode(
        token,
        settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
    )


def test_generate_token_signs_the_name_it_is_given():
    """The token carries the display name resolved by its caller."""
    user = UserFactory(full_name="Jane Doe")

    token = generate_token(room="my-room", user=user, display_name="Jane Doe")

    claims = decode_token(token)
    assert claims["name"] == "Jane Doe"
    assert claims["sub"] == str(user.sub)


def test_resolve_display_name_authenticated_uses_full_name():
    """An authenticated user with no requested name is shown their full name."""
    user = UserFactory(full_name="Jane Doe")

    assert resolve_display_name(user, None) == "Jane Doe"


def test_resolve_display_name_authenticated_fallback_user_representation():
    """
    When the user has no full name, the display name falls back to the user's
    string representation.
    """
    user = UserFactory(full_name=None)

    assert resolve_display_name(user, None) == str(user)


def test_resolve_display_name_explicit_username_overrides_default():
    """An explicitly provided username takes precedence over the full name."""
    user = UserFactory(full_name="Jane Doe")

    assert resolve_display_name(user, "Custom Name") == "Custom Name"


def test_resolve_display_name_authenticated_username_ignored_when_editing_disabled(
    settings,
):
    """With editing disabled, an authenticated user's username is ignored."""
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False
    user = UserFactory(full_name="Jane Doe")

    assert resolve_display_name(user, "Custom Name") == "Jane Doe"


def test_resolve_display_name_default_unaffected_when_editing_disabled(settings):
    """Disabling editing doesn't disturb the default full-name path."""
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False
    user = UserFactory(full_name="Jane Doe")

    assert resolve_display_name(user, None) == "Jane Doe"


def test_resolve_display_name_anonymous_uses_username_when_provided():
    """An anonymous user's provided username is used as the display name."""
    assert resolve_display_name(AnonymousUser(), "Guest42") == "Guest42"


def test_resolve_display_name_anonymous_username_kept_when_editing_disabled(settings):
    """The setting governs authenticated users only; anonymous can still set a name."""
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False

    assert resolve_display_name(AnonymousUser(), "Guest42") == "Guest42"


def test_resolve_display_name_anonymous_falls_back_to_anonymous_label():
    """With no username, an anonymous user is labelled 'Anonymous'."""
    assert resolve_display_name(AnonymousUser(), None) == "Anonymous"


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


@pytest.mark.parametrize(
    "taken,expected",
    [
        ([], "Jane Doe"),
        (["John Doe"], "Jane Doe"),
        (["Jane Doe"], "Jane Doe (2)"),
        (["Jane Doe", "Jane Doe (2)"], "Jane Doe (3)"),
        (["Jane Doe", "Jane Doe (3)"], "Jane Doe (2)"),
    ],
)
def test_unique_display_name(taken, expected):
    """A taken name is numbered from two, taking the lowest free number."""
    assert unique_display_name("Jane Doe", set(taken)) == expected


@pytest.mark.parametrize(
    "name,taken,expected",
    [
        (
            "X" * (MAX_DISPLAY_NAME_BYTES + 50),
            set(),
            "X" * MAX_DISPLAY_NAME_CHARACTERS,
        ),
        (
            "X" * MAX_DISPLAY_NAME_CHARACTERS,
            {"X" * MAX_DISPLAY_NAME_CHARACTERS},
            "X" * (MAX_DISPLAY_NAME_CHARACTERS - 4) + " (2)",
        ),
        ("A", {"A"}, "A (2)"),
        # 85 CJK characters are 255 bytes, so the number does not fit beside them
        ("\u540d" * 85, {"\u540d" * 85}, "\u540d" * 84 + " (2)"),
    ],
)
def test_unique_display_name_stays_within_livekits_limit(name, taken, expected):
    """A name too long for LiveKit loses its tail, never its number."""
    numbered = unique_display_name(name, taken)

    assert numbered == expected
    assert len(numbered.encode("utf-8")) <= MAX_DISPLAY_NAME_BYTES
    assert len(numbered) <= MAX_DISPLAY_NAME_CHARACTERS


@mock.patch("core.utils.create_livekit_client")
def test_list_participant_names_maps_identity_to_name(mock_create_livekit_client):
    """Participants are returned as a name per identity, the disconnected left out."""

    class MockResponse:
        """LiveKit ListParticipants response mock."""

        participants = [
            ParticipantInfo(identity="id-1", name="Jane Doe"),
            ParticipantInfo(identity="id-2", name="John Doe"),
            ParticipantInfo(
                identity="id-3", name="Gone", state=ParticipantInfo.State.DISCONNECTED
            ),
        ]

    mock_api_instance = mock.Mock()
    mock_api_instance.room = mock.Mock()
    mock_api_instance.room.list_participants = mock.AsyncMock(
        return_value=MockResponse()
    )
    mock_api_instance.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api_instance

    assert list_participant_names("my-room") == {"id-1": "Jane Doe", "id-2": "John Doe"}
    mock_api_instance.aclose.assert_called_once()


@mock.patch("core.utils.create_livekit_client")
def test_list_participant_names_empty_when_livekit_fails(mock_create_livekit_client):
    """A room LiveKit cannot answer for reads as an empty room."""

    mock_api_instance = mock.Mock()
    mock_api_instance.room = mock.Mock()
    mock_api_instance.room.list_participants = mock.AsyncMock(
        side_effect=TwirpError(msg="room not found", code=404, status=404)
    )
    mock_api_instance.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api_instance

    assert list_participant_names("my-room") == {}
    mock_api_instance.aclose.assert_called_once()


def test_generate_join_config_marks_a_taken_name(mock_list_participant_names):
    """Joining under a name already in the room adds a number."""
    mock_list_participant_names.return_value = {"someone-else": "Jane Doe"}

    config = generate_join_config(
        room_id="my-room", user=AnonymousUser(), username="Jane Doe"
    )

    assert decode_token(config["token"])["name"] == "Jane Doe (2)"


def test_generate_join_config_ignores_own_identity(mock_list_participant_names):
    """A participant rejoining keeps their name, their own entry aside."""
    user = UserFactory(full_name="Jane Doe")
    mock_list_participant_names.return_value = {str(user.sub): "Jane Doe"}

    config = generate_join_config(room_id="my-room", user=user)

    assert decode_token(config["token"])["name"] == "Jane Doe"


def test_generate_join_config_marks_a_forced_name(
    mock_list_participant_names, settings
):
    """Two people sharing one SSO name are still told apart."""
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False
    mock_list_participant_names.return_value = {"someone-else": "Jane Doe"}
    user = UserFactory(full_name="Jane Doe")

    config = generate_join_config(room_id="my-room", user=user, username="Another Name")

    assert decode_token(config["token"])["name"] == "Jane Doe (2)"
