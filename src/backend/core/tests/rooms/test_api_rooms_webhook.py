"""
Test LiveKit webhook endpoint on the rooms API.
"""

# pylint: disable=too-many-arguments,redefined-outer-name,too-many-positional-arguments,unused-argument
import base64
import hashlib
import json
from unittest import mock

from django.utils import timezone

import pytest
from livekit import api

from ...factories import RecordingFactory
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
        "api_secret": "test_api_secret_padded_to_32bytes!",
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
    assert response.json() == {"status": "error"}


def test_unknown_event_type(client, mock_livekit_config):
    """Should acknowledge (200) an unknown event type rather than reject it."""
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

    assert response.status_code == 200
    assert response.json() == {"status": "success"}


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
    event_data = json.dumps({"event": "participant_joined"})

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


@pytest.mark.django_db
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services",
    return_value=False,
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_egress_ended_keeps_a_partial_transcript(
    mock_update_metadata,
    mock_notify,
    mock_notify_external_services,
    client,
    mock_livekit_config,
):
    """Should save a transcript whose egress lost the room but uploaded its file.

    LiveKit Egress v1.14 reports it as failed. The payload mirrors the one it
    sends, including a field unknown to the pinned livekit-protocol, which
    must be ignored rather than rejected.
    """
    recording = RecordingFactory(
        worker_id="EG_hycBMAjmt6Ub", mode="transcript", status="active"
    )
    event_data = json.dumps(
        {
            "event": "egress_ended",
            "egressInfo": {
                "egressId": "EG_hycBMAjmt6Ub",
                "roomId": "RM_hycBMAjmt6Ub",
                "roomName": str(recording.room.id),
                "status": "EGRESS_FAILED",
                "error": "recording ended early: connection to room failed",
                "errorCode": 503,
                "details": "End reason: Source closed",
                "fileResults": [
                    {
                        "filename": f"recordings/{recording.id}.ogg",
                        "location": f"https://s3.example.com/recordings/{recording.id}.ogg",
                        "size": "123456",
                    }
                ],
            },
            "id": "EV_eugWmGhovZmm",
            "createdAt": str(int(timezone.now().timestamp())),
        }
    )
    hash64 = base64.b64encode(hashlib.sha256(event_data.encode()).digest()).decode()
    token = api.AccessToken(
        mock_livekit_config["api_key"], mock_livekit_config["api_secret"]
    )
    token.claims.sha256 = hash64

    response = client.post(
        "/api/v1.0/rooms/webhooks-livekit/",
        data=event_data,
        content_type="application/json",
        HTTP_AUTHORIZATION=token.to_jwt(),
    )

    assert response.status_code == 200
    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id),
        notification_data={"type": "transcriptionInterrupted"},
    )
    mock_notify_external_services.assert_called_once_with(recording)

    recording.refresh_from_db()

    assert recording.status == "saved"
