"""
Test LiveKit webhook endpoint on the rooms API.
"""

# ruff: noqa: PLR0913
# pylint: disable=R0913,W0621,R0917,W0613
import base64
import hashlib
import json
from unittest import mock

import pytest
from livekit import api

from ...services.livekit_events import ActionFailedError, LiveKitEventsService


@pytest.fixture
def webhook_event_data():
    """Sample webhook event data for testing."""
    return {
        "event": "room_finished",
        "room": {
            "sid": "RM_hycBMAjmt6Ub",
            "name": "00000000-0000-0000-0000-000000000000",
            "emptyTimeout": 300,
            "creationTime": "1692627281",
            "turnPassword": "fake-turn-password",
            "enabledCodecs": [
                {"mime": "audio/opus"},
                {"mime": "video/H264"},
                {"mime": "video/VP8"},
            ],
        },
        "id": "EV_eugWmGhovZmm",
        "createdAt": "1692985556",
    }


@pytest.fixture
def serialized_event_data(webhook_event_data):
    """Serialize event data to JSON."""
    return json.dumps(webhook_event_data)


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
def auth_token(serialized_event_data, mock_livekit_config):
    """Generate authentication token for webhook request."""
    hash64 = base64.b64encode(
        hashlib.sha256(serialized_event_data.encode()).digest()
    ).decode()
    token = api.AccessToken(
        mock_livekit_config["api_key"], mock_livekit_config["api_secret"]
    )
    token.claims.sha256 = hash64
    return token.to_jwt()


def test_missing_auth_header(client, serialized_event_data, mock_livekit_config):
    """Should return 401 when auth header is missing."""
    response = client.post(
        "/api/v1.0/rooms/webhooks-livekit/",
        data=serialized_event_data,
        content_type="application/json",
    )

    assert response.status_code == 401
    assert response.json() == {
        "status": "error",
        "message": "Authorization header missing",
    }


def test_invalid_payload(client, auth_token, mock_livekit_config):
    """Should return 400 for invalid payload."""
    response = client.post(
        "/api/v1.0/rooms/webhooks-livekit/",
        data=json.dumps({"invalid": "payload"}),
        content_type="application/json",
        HTTP_AUTHORIZATION=auth_token,
    )

    assert response.status_code == 400
    assert response.json() == {"status": "error", "message": "Invalid webhook payload"}


def test_unknown_event_type(client, mock_livekit_config):
    """Should return 422 for unknown event type."""
    event_data = json.dumps({"event": "unknown_event_type"})

    # Generate auth token for this specific payload
    hash64 = base64.b64encode(hashlib.sha256(event_data.encode()).digest()).decode()
    token = api.AccessToken(
        mock_livekit_config["api_key"], mock_livekit_config["api_secret"]
    )
    token.claims.sha256 = hash64
    auth_token = token.to_jwt()

    response = client.post(
        "/api/v1.0/rooms/webhooks-livekit/",
        data=event_data,
        content_type="application/json",
        HTTP_AUTHORIZATION=auth_token,
    )

    assert response.status_code == 422
    assert response.json() == {
        "status": "error",
        "message": "Unknown webhook type: unknown_event_type",
    }


@mock.patch.object(LiveKitEventsService, "_handle_room_finished")
def test_handled_event_type(
    mock_handler,
    client,
    serialized_event_data,
    auth_token,
    mock_livekit_config,
):
    """Should process valid webhook successfully."""
    response = client.post(
        "/api/v1.0/rooms/webhooks-livekit/",
        data=serialized_event_data,
        content_type="application/json",
        HTTP_AUTHORIZATION=auth_token,
    )

    mock_handler.assert_called_once()
    assert response.status_code == 200
    assert response.json() == {"status": "success"}


def test_unhandled_event_type(client, mock_livekit_config):
    """Should return 200 for event types that have no handler."""
    event_data = json.dumps({"event": "room_started"})

    hash64 = base64.b64encode(hashlib.sha256(event_data.encode()).digest()).decode()
    token = api.AccessToken(
        mock_livekit_config["api_key"], mock_livekit_config["api_secret"]
    )
    token.claims.sha256 = hash64
    auth_token = token.to_jwt()

    response = client.post(
        "/api/v1.0/rooms/webhooks-livekit/",
        data=event_data,
        content_type="application/json",
        HTTP_AUTHORIZATION=auth_token,
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success"}


def test_action_error(client, mock_livekit_config):
    """Should raise exceptions when errors occur during LiveKit webhook processing."""
    event_data = json.dumps(
        {
            "event": "room_finished",
            "room": {"sid": "RM_hycBMAjmt6Ub", "name": "invalid-uuid"},
        }
    )
    hash64 = base64.b64encode(hashlib.sha256(event_data.encode()).digest()).decode()
    token = api.AccessToken(
        mock_livekit_config["api_key"], mock_livekit_config["api_secret"]
    )
    token.claims.sha256 = hash64
    auth_token = token.to_jwt()

    with pytest.raises(
        ActionFailedError,
        match="Failed to process room finished event",
    ):
        client.post(
            "/api/v1.0/rooms/webhooks-livekit/",
            data=event_data,
            content_type="application/json",
            HTTP_AUTHORIZATION=auth_token,
        )
