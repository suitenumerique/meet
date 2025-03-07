"""
Test LiveKitEvents service.
"""
# pylint: disable=W0621,W0613, W0212

import uuid
from unittest import mock

import pytest

from core.services.livekit_events import (
    ActionFailedError,
    AuthenticationError,
    InvalidPayloadError,
    LiveKitEventsService,
    UnsupportedEventTypeError,
    api,
)
from core.services.lobby import LobbyService

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_livekit_config(settings):
    """Mock LiveKit configuration."""
    settings.LIVEKIT_CONFIGURATION = {
        "api_key": "test_api_key",
        "api_secret": "test_api_secret",
        "url": "https://test-livekit.example.com/",
    }
    return settings.LIVEKIT_CONFIGURATION


@pytest.fixture
def service(mock_livekit_config):
    """Initialize LiveKitEventsService."""
    return LiveKitEventsService()


@mock.patch("livekit.api.TokenVerifier")
@mock.patch("livekit.api.WebhookReceiver")
def test_initialization(
    mock_webhook_receiver, mock_token_verifier, mock_livekit_config
):
    """Should correctly initialize the service with required dependencies."""

    api_key = mock_livekit_config["api_key"]
    api_secret = mock_livekit_config["api_secret"]

    service = LiveKitEventsService()

    mock_token_verifier.assert_called_once_with(api_key, api_secret)
    mock_webhook_receiver.assert_called_once_with(mock_token_verifier.return_value)
    assert isinstance(service.lobby_service, LobbyService)


@mock.patch.object(LobbyService, "clear_room_cache")
def test_handle_room_finished(mock_clear_cache, service):
    """Should clear lobby cache when room is finished."""

    mock_room_name = uuid.uuid4()

    mock_data = mock.MagicMock()
    mock_data.room.name = str(mock_room_name)

    service._handle_room_finished(mock_data)

    mock_clear_cache.assert_called_once_with(mock_room_name)


@mock.patch.object(
    LobbyService, "clear_room_cache", side_effect=Exception("Test error")
)
def test_handle_room_finished_error(mock_clear_cache, service):
    """Should raise ActionFailedError when processing fails."""
    mock_data = mock.MagicMock()
    mock_data.room.name = "00000000-0000-0000-0000-000000000000"
    with pytest.raises(
        ActionFailedError, match="Failed to process room finished event"
    ):
        service._handle_room_finished(mock_data)


def test_handle_room_finished_invalid_room_name(service):
    """Should raise ActionFailedError when processing fails."""
    mock_data = mock.MagicMock()
    mock_data.room.name = "invalid"
    with pytest.raises(
        ActionFailedError, match="Failed to process room finished event"
    ):
        service._handle_room_finished(mock_data)


@mock.patch.object(
    api.WebhookReceiver, "receive", side_effect=Exception("Invalid payload")
)
def test_receive_invalid_payload(mock_receive, service):
    """Should raise InvalidPayloadError for invalid payloads."""
    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    with pytest.raises(InvalidPayloadError, match="Invalid webhook payload"):
        service.receive(mock_request)


def test_receive_missing_auth(service):
    """Should raise AuthenticationError when auth header is missing."""
    mock_request = mock.MagicMock()
    mock_request.headers = {}

    with pytest.raises(AuthenticationError, match="Authorization header missing"):
        service.receive(mock_request)


@mock.patch.object(api.WebhookReceiver, "receive")
def test_receive_unsupported_event(mock_receive, service):
    """Should raise LiveKitWebhookError for unsupported events."""
    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    # Mock returned data with unsupported event type
    mock_data = mock.MagicMock()
    mock_data.event = "unsupported_event"
    mock_receive.return_value = mock_data

    with pytest.raises(
        UnsupportedEventTypeError, match="Unknown webhook type: unsupported_event"
    ):
        service.receive(mock_request)
