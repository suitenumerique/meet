"""
Test LiveKitEvents service.
"""
# pylint: disable=W0621,W0613, W0212, E0611

import uuid
from unittest import mock

import pytest
from livekit.api import EgressStatus

from core.factories import RecordingFactory, RoomFactory
from core.recording.services.recording_events import RecordingEventsService
from core.services.livekit_events import (
    ActionFailedError,
    AuthenticationError,
    InvalidPayloadError,
    LiveKitEventsService,
    UnsupportedEventTypeError,
    api,
)
from core.services.lobby import LobbyService
from core.services.telephony import TelephonyException, TelephonyService
from core.utils import NotificationError

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
    assert isinstance(service.telephony_service, TelephonyService)
    assert isinstance(service.recording_events, RecordingEventsService)


@pytest.mark.parametrize(
    ("mode", "notification_type"),
    (
        ("screen_recording", "screenRecordingLimitReached"),
        ("transcript", "transcriptionLimitReached"),
    ),
)
@mock.patch("core.utils.notify_participants")
def test_handle_egress_ended_success(mock_notify, mode, notification_type, service):
    """Should successfully stop recording and notifies all participant."""

    recording = RecordingFactory(worker_id="worker-1", mode=mode, status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    service._handle_egress_ended(mock_data)

    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id), notification_data={"type": notification_type}
    )

    recording.refresh_from_db()
    assert recording.status == "stopped"


@mock.patch("core.utils.notify_participants")
def test_handle_egress_ended_notification_fails(mock_notify, service):
    """Should raise ActionFailedError when notification fails but still stop recording."""

    recording = RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    mock_notify.side_effect = NotificationError("Error notifying")

    with pytest.raises(
        ActionFailedError,
        match=r"Failed to process limit reached event for recording .+",
    ):
        service._handle_egress_ended(mock_data)

    recording.refresh_from_db()
    assert recording.status == "stopped"


@mock.patch("core.utils.notify_participants")
def test_handle_egress_ended_recording_not_found(mock_notify, service):
    """Should raise ActionFailedError when recording doesn't exist."""

    recording = RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = "worker-2"
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    with pytest.raises(
        ActionFailedError, match=r"Recording with worker ID .+ does not exist"
    ):
        service._handle_egress_ended(mock_data)

    mock_notify.assert_not_called()

    recording.refresh_from_db()
    assert recording.status == "active"


@mock.patch("core.utils.notify_participants")
def test_handle_egress_ended_recording_not_active(mock_notify, service):
    """Should ignore non-active recordings."""

    recording = RecordingFactory(worker_id="worker-1", status="failed_to_stop")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = "worker-1"
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    service._handle_egress_ended(mock_data)

    mock_notify.assert_not_called()

    recording.refresh_from_db()
    assert recording.status == "failed_to_stop"


@mock.patch("core.utils.notify_participants")
def test_handle_egress_ended_recording_not_limit_reached(mock_notify, service):
    """Should ignore egress non-limit-reached statuses."""

    recording = RecordingFactory(worker_id="worker-1", status="stopped")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = "worker-1"
    mock_data.egress_info.status = EgressStatus.EGRESS_COMPLETE

    service._handle_egress_ended(mock_data)

    mock_notify.assert_not_called()
    assert recording.status == "stopped"


@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(TelephonyService, "delete_dispatch_rule")
def test_handle_room_finished_clears_cache_and_deletes_dispatch_rule(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should clear lobby cache and delete telephony dispatch rule when room finishes."""
    settings.ROOM_TELEPHONY_ENABLED = True
    mock_room_name = uuid.uuid4()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(mock_room_name)

    service._handle_room_finished(mock_data)

    mock_delete_dispatch_rule.assert_called_once_with(mock_room_name)
    mock_clear_cache.assert_called_once_with(mock_room_name)


@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(TelephonyService, "delete_dispatch_rule")
def test_handle_room_finished_skips_telephony_when_disabled(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should clear lobby cache but skip dispatch rule deletion when telephony is disabled."""
    settings.ROOM_TELEPHONY_ENABLED = False
    mock_room_name = uuid.uuid4()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(mock_room_name)

    service._handle_room_finished(mock_data)

    mock_delete_dispatch_rule.assert_not_called()
    mock_clear_cache.assert_called_once_with(mock_room_name)


@mock.patch.object(
    LobbyService, "clear_room_cache", side_effect=Exception("Test error")
)
@mock.patch.object(TelephonyService, "delete_dispatch_rule")
def test_handle_room_finished_raises_error_when_cache_clearing_fails(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should raise ActionFailedError when lobby cache clearing fails when room finishes."""
    settings.ROOM_TELEPHONY_ENABLED = True
    mock_data = mock.MagicMock()
    mock_data.room.name = "00000000-0000-0000-0000-000000000000"

    expected_error = (
        "Failed to clear room cache for room 00000000-0000-0000-0000-000000000000"
    )

    with pytest.raises(ActionFailedError, match=expected_error):
        service._handle_room_finished(mock_data)

    mock_delete_dispatch_rule.assert_called_once_with(
        uuid.UUID("00000000-0000-0000-0000-000000000000")
    )


@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(
    TelephonyService,
    "delete_dispatch_rule",
    side_effect=TelephonyException("Test error"),
)
def test_handle_room_finished_raises_error_when_telephony_deletion_fails(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should raise ActionFailedError when dispatch rule deletion fails when room finishes."""
    settings.ROOM_TELEPHONY_ENABLED = True
    mock_data = mock.MagicMock()
    mock_data.room.name = "00000000-0000-0000-0000-000000000000"

    expected_error = (
        "Failed to delete telephony dispatch rule for room "
        "00000000-0000-0000-0000-000000000000"
    )

    with pytest.raises(ActionFailedError, match=expected_error):
        service._handle_room_finished(mock_data)

    mock_clear_cache.assert_not_called()


def test_handle_room_finished_raises_error_for_invalid_room_name(service):
    """Should raise ActionFailedError when room name format is invalid when room finishes."""
    mock_data = mock.MagicMock()
    mock_data.room.name = "invalid"

    with pytest.raises(
        ActionFailedError, match="Failed to process room finished event"
    ):
        service._handle_room_finished(mock_data)


@mock.patch.object(TelephonyService, "create_dispatch_rule")
def test_handle_room_started_creates_dispatch_rule_successfully(
    mock_create_dispatch_rule, service, settings
):
    """Should create telephony dispatch rule when room starts successfully."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    service._handle_room_started(mock_data)

    mock_create_dispatch_rule.assert_called_once_with(room)


@mock.patch.object(TelephonyService, "create_dispatch_rule")
def test_handle_room_started_skips_dispatch_rule_when_telephony_disabled(
    mock_create_dispatch_rule, service, settings
):
    """Should skip creating telephony dispatch rule when telephony is disabled during room start."""
    settings.ROOM_TELEPHONY_ENABLED = False
    room = RoomFactory()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    service._handle_room_started(mock_data)

    mock_create_dispatch_rule.assert_not_called()


def test_handle_room_started_raises_error_for_invalid_room_name(service):
    """Should raise ActionFailedError when room name format is invalid  when room starts."""
    mock_data = mock.MagicMock()
    mock_data.room.name = "invalid"

    with pytest.raises(ActionFailedError, match="Failed to process room started event"):
        service._handle_room_started(mock_data)


def test_handle_room_started_raises_error_for_nonexistent_room(service):
    """Should raise ActionFailedError when a room starts that doesn't exist in the database."""
    mock_data = mock.MagicMock()
    mock_data.room.name = str(uuid.uuid4())

    expected_error = f"Room with ID {mock_data.room.name} does not exist"

    with pytest.raises(ActionFailedError, match=expected_error):
        service._handle_room_started(mock_data)


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
