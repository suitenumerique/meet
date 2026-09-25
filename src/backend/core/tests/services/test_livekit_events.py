"""
Test LiveKitEvents service.
"""
# pylint: disable=W0621,W0613, W0212, E0611

import logging
import uuid
from datetime import timedelta
from unittest import mock

from django.utils import timezone

import pytest
from livekit.api import EgressStatus

from core.factories import RecordingFactory, RoomFactory
from core.models import Room
from core.recording.enums import RecordingWorkerEvent
from core.recording.services.recording_events import RecordingEventsService
from core.services.livekit_events import (
    EGRESS_STATUS_TO_RECORDING_EVENT,
    ActionFailedError,
    AuthenticationError,
    InvalidPayloadError,
    LiveKitEventsService,
    api,
    to_recording_event,
)
from core.services.lobby import LobbyService
from core.services.room_management import RoomManagementException
from core.services.sip_management import (
    SIPException,
    SIPManagement,
)
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
    assert isinstance(service.sip_management, SIPManagement)
    assert isinstance(service.recording_events, RecordingEventsService)


@pytest.mark.parametrize(
    ("mode", "notification_type"),
    (
        ("screen_recording", "screenRecordingLimitReached"),
        ("transcript", "transcriptionLimitReached"),
    ),
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_success(  # pylint: disable=too-many-arguments, too-many-positional-arguments
    mock_update_metadata, mock_notify, mode, notification_type, service
):
    """Should successfully stop recording and notify all participant."""

    recording = RecordingFactory(worker_id="worker-1", mode=mode, status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    service._handle_egress_ended(mock_data)

    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id), notification_data={"type": notification_type}
    )
    mock_update_metadata.assert_called_once_with(
        str(recording.room.id), remove_keys=["recording_mode", "recording_status"]
    )

    recording.refresh_from_db()

    # NB: notify_external_services will return False, so status is "saved"
    assert recording.status == "saved"


@pytest.mark.parametrize(
    ("egress_status", "status"),
    (
        (EgressStatus.EGRESS_ACTIVE, "started"),
        (EgressStatus.EGRESS_ENDING, "saving"),
    ),
)
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_updated_success(
    mock_update_metadata, egress_status, status, service
):
    """Should successfully update room's metadata."""

    recording = RecordingFactory(worker_id="worker-1", status="initiated")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = egress_status

    service._handle_egress_updated(mock_data)

    mock_update_metadata.assert_called_once_with(
        str(recording.room.id), {"recording_status": status}
    )


@pytest.mark.parametrize(
    ("mode", "notification_type"),
    (
        ("screen_recording", "screenRecordingLimitReached"),
        ("transcript", "transcriptionLimitReached"),
    ),
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_metadata_update_fails(  # pylint: disable=too-many-arguments, too-many-positional-arguments
    mock_update_metadata, mock_notify, mode, notification_type, service
):
    """Should successfully stop and save recording when metadata's update fails."""

    recording = RecordingFactory(worker_id="worker-1", mode=mode, status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    mock_update_metadata.side_effect = RoomManagementException("Error notifying")

    service._handle_egress_ended(mock_data)

    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id), notification_data={"type": notification_type}
    )
    recording.refresh_from_db()

    # NB: notify_external_services will return False, so status is "saved"
    assert recording.status == "saved"


@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_notification_fails(
    mock_update_metadata, mock_notify, mock_notify_external_services, service
):
    """Should still stop and save the recording when notifying participants fails."""

    mock_notify_external_services.return_value = False
    mock_notify.side_effect = NotificationError("Error notifying")

    recording = RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    service._handle_egress_ended(mock_data)

    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id),
        notification_data={"type": "screenRecordingLimitReached"},
    )
    mock_update_metadata.assert_called_once_with(
        str(recording.room.id), remove_keys=["recording_mode", "recording_status"]
    )

    recording.refresh_from_db()
    assert recording.status == "saved"


@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_recording_not_found(
    mock_update_metadata, mock_notify, service
):
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
    mock_update_metadata.assert_not_called()

    recording.refresh_from_db()
    assert recording.status == "active"


@pytest.mark.parametrize(
    "egress_status",
    (
        EgressStatus.EGRESS_FAILED,
        EgressStatus.EGRESS_ABORTED,
        EgressStatus.EGRESS_LIMIT_REACHED,
    ),
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_recording_should_not_be_saved(
    mock_update_metadata, mock_notify, egress_status, service
):
    """Don't update status for recordings that must not be saved."""

    recording = RecordingFactory(worker_id="worker-1", status="failed_to_stop")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = "worker-1"
    mock_data.egress_info.status = egress_status

    service._handle_egress_ended(mock_data)

    mock_notify.assert_not_called()
    mock_update_metadata.assert_called_once_with(
        str(recording.room.id), remove_keys=["recording_mode", "recording_status"]
    )

    recording.refresh_from_db()
    assert recording.status == "failed_to_stop"


@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_complete_does_not_notify_participants(
    mock_update_metadata, mock_notify, mock_notify_external_services, service
):
    """Shouldn't notify participants on a successful egress.

    EGRESS_COMPLETE is the only ended status that notifies no one: limit
    reached, aborted and failed egresses each send their own notification.
    A stopped recording is simply finalized, which is the nominal flow once
    the egress uploaded the file of a user-initiated stop.
    """

    mock_notify_external_services.return_value = False

    recording = RecordingFactory(worker_id="worker-1", status="stopped")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = "worker-1"
    mock_data.egress_info.status = EgressStatus.EGRESS_COMPLETE

    service._handle_egress_ended(mock_data)

    mock_notify.assert_not_called()
    mock_update_metadata.assert_called_once_with(
        str(recording.room.id), remove_keys=["recording_mode", "recording_status"]
    )
    mock_notify_external_services.assert_called_once_with(recording)

    recording.refresh_from_db()
    assert recording.status == "saved"


@mock.patch("core.services.livekit_events.MetadataCollectorService")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_calls_metadata_collector_stop_when_conditions_are_met(
    mock_update_metadata, mock_collector_class, service, settings
):
    """Should call MetadataCollectorService.stop when it exists."""
    settings.METADATA_COLLECTOR_ENABLED = True

    recording = RecordingFactory(
        worker_id="worker-1",
        status="active",
        options={"metadata_collector_dispatch_id": "dispatch-123"},
    )
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_COMPLETE

    mock_collector = mock.Mock()
    mock_collector_class.return_value = mock_collector

    service._handle_egress_ended(mock_data)

    mock_collector.stop.assert_called_once_with(recording)


@pytest.mark.parametrize(
    "metadata_enabled,options",
    [
        (True, {}),
        (False, {}),
    ],
)
@mock.patch("core.services.livekit_events.MetadataCollectorService")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_does_not_call_metadata_collector_stop_when_conditions_not_met(
    _, mock_collector_class, metadata_enabled, options, service, settings
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Should not call MetadataCollectorService.stop when it does not exist."""
    settings.METADATA_COLLECTOR_ENABLED = metadata_enabled

    recording = RecordingFactory(
        worker_id="worker-1",
        status="active",
        options=options,
    )
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_COMPLETE

    mock_collector = mock.Mock()
    mock_collector_class.return_value = mock_collector

    service._handle_egress_ended(mock_data)

    mock_collector.stop.assert_not_called()


@pytest.mark.parametrize(
    ("egress_status", "recording_status", "event", "expected_level"),
    (
        (EgressStatus.EGRESS_ABORTED, "active", "aborted", logging.INFO),
        (EgressStatus.EGRESS_FAILED, "active", "failed", logging.ERROR),
        # The synchronous stop may already have persisted the terminal status,
        # and the error details exist only in the webhook payload.
        (EgressStatus.EGRESS_ABORTED, "aborted", "aborted", logging.INFO),
        (EgressStatus.EGRESS_FAILED, "failed", "failed", logging.ERROR),
    ),
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_logs_livekit_error(  # noqa: PLR0913, PLR0917
    mock_update_metadata,
    mock_notify,
    egress_status,
    recording_status,
    event,
    expected_level,
    service,
    caplog,
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Should log the reason LiveKit reported an unsuccessful egress."""

    recording = RecordingFactory(worker_id="worker-1", status=recording_status)
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = egress_status
    mock_data.egress_info.error = "could not connect to the room"
    mock_data.egress_info.error_code = 500

    with caplog.at_level(logging.INFO):
        service._handle_egress_ended(mock_data)

    assert (
        f"Recording worker reported {event} for recording {recording.id}" in caplog.text
    )
    assert "could not connect to the room" in caplog.text
    assert "error_code=500" in caplog.text

    worker_logs = [
        record
        for record in caplog.records
        if record.name == "core.recording.services.recording_events"
    ]
    assert [record.levelno for record in worker_logs] == [expected_level]


@pytest.mark.parametrize(
    "egress_status",
    (EgressStatus.EGRESS_COMPLETE, EgressStatus.EGRESS_LIMIT_REACHED),
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_does_not_log_error_on_successful_egress(  # noqa: PLR0913, PLR0917
    mock_update_metadata,
    mock_notify,
    mock_notify_external_services,
    egress_status,
    service,
    caplog,
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Shouldn't log an egress error when LiveKit reports a successful egress."""

    recording = RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = egress_status

    with caplog.at_level(logging.ERROR):
        service._handle_egress_ended(mock_data)

    assert "Recording worker reported" not in caplog.text


@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_logs_livekit_error_before_cleaning_up(
    mock_update_metadata, mock_notify, service, caplog
):
    """Should log the failure reason even when the cleanup fails afterwards."""

    mock_update_metadata.side_effect = RuntimeError("LiveKit is unreachable")

    recording = RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_FAILED
    mock_data.egress_info.error = "could not connect to the room"
    mock_data.egress_info.error_code = 500

    with caplog.at_level(logging.ERROR), pytest.raises(RuntimeError):
        service._handle_egress_ended(mock_data)

    assert (
        f"Recording worker reported failed for recording {recording.id}" in caplog.text
    )
    assert "could not connect to the room" in caplog.text


def test_egress_status_mapping_covers_every_livekit_status():
    """Every egress status LiveKit can report must translate to a recording event."""

    unmapped = [
        name
        for name in EgressStatus.keys()
        if getattr(EgressStatus, name) not in EGRESS_STATUS_TO_RECORDING_EVENT
    ]

    assert not unmapped


@pytest.mark.parametrize(
    ("egress_status", "expected_event"),
    (
        (EgressStatus.EGRESS_STARTING, RecordingWorkerEvent.STARTING),
        (EgressStatus.EGRESS_ACTIVE, RecordingWorkerEvent.STARTED),
        (EgressStatus.EGRESS_ENDING, RecordingWorkerEvent.SAVING),
        (EgressStatus.EGRESS_COMPLETE, RecordingWorkerEvent.COMPLETED),
        (EgressStatus.EGRESS_LIMIT_REACHED, RecordingWorkerEvent.LIMIT_REACHED),
        (EgressStatus.EGRESS_ABORTED, RecordingWorkerEvent.ABORTED),
        (EgressStatus.EGRESS_FAILED, RecordingWorkerEvent.FAILED),
    ),
)
def test_to_recording_event_translates_egress_status(egress_status, expected_event):
    """Should translate a LiveKit egress status into a recording worker event."""

    assert to_recording_event(egress_status) == expected_event


def test_to_recording_event_returns_none_on_unmapped_status(caplog):
    """Should warn and return None when LiveKit reports an unknown status."""

    with caplog.at_level(logging.WARNING):
        event = to_recording_event(999)

    assert event is None
    assert "Unmapped LiveKit egress status" in caplog.text


@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_updated_ignores_unmapped_status(mock_update_metadata, service):
    """Shouldn't touch the room's metadata when the egress status is unknown."""

    RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = "worker-1"
    mock_data.egress_info.status = 999

    service._handle_egress_updated(mock_data)

    mock_update_metadata.assert_not_called()


@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_handle_room_finished_clears_cache_and_deletes_dispatch_rule(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should clear lobby cache and delete SIP dispatch rule when room finishes."""
    settings.ROOM_TELEPHONY_ENABLED = True
    mock_room_name = uuid.uuid4()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(mock_room_name)

    service._handle_room_finished(mock_data)

    mock_delete_dispatch_rule.assert_called_once_with(mock_room_name)
    mock_clear_cache.assert_called_once_with(mock_room_name)


@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_handle_room_finished_deletes_dispatch_rule_when_only_roomkit_enabled(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should delete dispatch rule when only roomkit is enabled when room finishes."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = True
    mock_room_name = uuid.uuid4()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(mock_room_name)

    service._handle_room_finished(mock_data)

    mock_delete_dispatch_rule.assert_called_once_with(mock_room_name)
    mock_clear_cache.assert_called_once_with(mock_room_name)


@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_handle_room_finished_skips_telephony_when_disabled(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should clear lobby cache but skip dispatch rule deletion when telephony is disabled."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    mock_room_name = uuid.uuid4()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(mock_room_name)

    service._handle_room_finished(mock_data)

    mock_delete_dispatch_rule.assert_not_called()
    mock_clear_cache.assert_called_once_with(mock_room_name)


@mock.patch.object(
    LobbyService, "clear_room_cache", side_effect=Exception("Test error")
)
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
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
    SIPManagement,
    "delete_dispatch_rule",
    side_effect=SIPException("Test error"),
)
def test_handle_room_finished_raises_error_when_telephony_deletion_fails(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should raise ActionFailedError when dispatch rule deletion fails when room finishes."""
    settings.ROOM_TELEPHONY_ENABLED = True
    mock_data = mock.MagicMock()
    mock_data.room.name = "00000000-0000-0000-0000-000000000000"

    expected_error = (
        "Failed to delete sip dispatch rule for room "
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


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
def test_handle_room_started_creates_dispatch_rule_successfully(
    mock_ensure_dispatch_rule, service, settings
):
    """Should ensure the SIP dispatch rule exists when room starts successfully."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    service._handle_room_started(mock_data)

    mock_ensure_dispatch_rule.assert_called_once_with(room)


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
def test_handle_room_started_creates_dispatch_rule_when_only_roomkit_enabled(
    mock_ensure_dispatch_rule, service, settings
):
    """Should ensure the dispatch rule exists when only roomkit is enabled during room start."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = True
    room = RoomFactory()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    service._handle_room_started(mock_data)

    mock_ensure_dispatch_rule.assert_called_once_with(room)


@mock.patch.object(SIPManagement, "ensure_dispatch_rule", return_value=False)
def test_handle_room_started_ignores_existing_dispatch_rule(
    mock_ensure_dispatch_rule, service, settings
):
    """Should proceed silently when the dispatch rule already exists when room starts."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    # ensure_dispatch_rule reports the rule as pre-existing: nothing to raise
    service._handle_room_started(mock_data)

    mock_ensure_dispatch_rule.assert_called_once_with(room)


@mock.patch.object(
    SIPManagement,
    "ensure_dispatch_rule",
    side_effect=SIPException("Test error"),
)
def test_handle_room_started_raises_error_when_dispatch_rule_creation_fails(
    mock_ensure_dispatch_rule, service, settings
):
    """Should raise ActionFailedError when ensuring the dispatch rule fails when room starts."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    expected_error = f"Failed to create sip dispatch rule for room {room.id}"

    with pytest.raises(ActionFailedError, match=expected_error):
        service._handle_room_started(mock_data)


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
def test_handle_room_started_skips_dispatch_rule_when_telephony_disabled(
    mock_ensure_dispatch_rule, service, settings
):
    """Should skip ensuring the SIP dispatch rule when telephony is disabled during room start."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    room = RoomFactory()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    service._handle_room_started(mock_data)

    mock_ensure_dispatch_rule.assert_not_called()


def test_handle_room_started_records_access(service, settings):
    """Should record the access on a room that is started for the first time."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    room = RoomFactory()
    other_room = RoomFactory()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    now = timezone.now()
    with mock.patch("django.utils.timezone.now", return_value=now):
        service._handle_room_started(mock_data)

    room.refresh_from_db()
    assert room.last_started_at == now

    other_room.refresh_from_db()
    assert other_room.last_started_at is None


def test_handle_room_started_overwrites_previous_access(service, settings):
    """Should overwrite the previous access each time the room is started again."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    now = timezone.now()
    room = RoomFactory(last_started_at=now - timedelta(days=30))
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    with mock.patch("django.utils.timezone.now", return_value=now):
        service._handle_room_started(mock_data)

    room.refresh_from_db()
    assert room.last_started_at == now


def test_handle_room_started_only_updates_access(service, settings):
    """Should leave the slug and the update date untouched when recording the access."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    room = RoomFactory()
    Room.objects.filter(pk=room.pk).update(slug="𓆑")
    room.refresh_from_db()
    updated_at = room.updated_at
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    service._handle_room_started(mock_data)

    room.refresh_from_db()
    assert room.last_started_at is not None
    assert room.slug == "𓆑"
    assert room.updated_at == updated_at


@mock.patch.object(
    SIPManagement,
    "ensure_dispatch_rule",
    side_effect=SIPException("Test error"),
)
def test_handle_room_started_records_access_when_dispatch_rule_creation_fails(
    mock_ensure_dispatch_rule, service, settings
):
    """Should still record the access when ensuring the dispatch rule fails."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room.id)

    with pytest.raises(ActionFailedError):
        service._handle_room_started(mock_data)

    room.refresh_from_db()
    assert room.last_started_at is not None


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
def test_receive_unknown_event_is_acknowledged(mock_receive, service, caplog):
    """Unknown event types are logged and ignored, not rejected.

    LiveKit adds event types over time and does not retry 4xx responses, so
    raising here would silently drop the event.
    """
    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = str(uuid.uuid4())
    mock_data.event = "some_future_event"
    mock_receive.return_value = mock_data

    with caplog.at_level("WARNING", logger="core.services.livekit_events"):
        service.receive(mock_request)  # must not raise

    assert "Ignoring unknown LiveKit webhook event type 'some_future_event'" in (
        caplog.text
    )


@mock.patch.object(api.WebhookReceiver, "receive")
@mock.patch.object(LiveKitEventsService, "_handle_room_started")
def test_receive_no_filter_processes_all_events(
    mock_handle_room_started, mock_receive, mock_livekit_config, settings
):
    """Should process all events when filter regex is not configured."""
    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX = None

    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = "!JIfCxVLcKKkWrmVBOb:your-domain.com"
    mock_data.event = "room_started"
    mock_receive.return_value = mock_data

    service = LiveKitEventsService()
    service.receive(mock_request)

    mock_handle_room_started.assert_called_once()


@mock.patch.object(api.WebhookReceiver, "receive")
@mock.patch.object(LiveKitEventsService, "_handle_room_started")
def test_receive_invalid_filter_regex_processes_all_events(
    mock_handle_room_started, mock_receive, mock_livekit_config, settings
):
    """Should process all events when filter regex is invalid (fail-safe)."""
    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX = "(abc"

    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = "!JIfCxVLcKKkWrmVBOb:your-domain.com"
    mock_data.event = "room_started"
    mock_receive.return_value = mock_data

    service = LiveKitEventsService()
    service.receive(mock_request)

    mock_handle_room_started.assert_called_once()


@mock.patch.object(api.WebhookReceiver, "receive")
@mock.patch.object(LiveKitEventsService, "_handle_room_started")
def test_receive_filter_drops_non_matching_events(
    mock_handle_room_started, mock_receive, mock_livekit_config, settings
):
    """Should drop events when room name does not match filter regex."""
    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX = (
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    )

    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = "!JIfCxVLcKKkWrmVBOb:your-domain.com"
    mock_data.event = "room_started"
    mock_receive.return_value = mock_data

    service = LiveKitEventsService()
    service.receive(mock_request)

    mock_handle_room_started.assert_not_called()


@mock.patch.object(api.WebhookReceiver, "receive")
@mock.patch.object(LiveKitEventsService, "_handle_room_started")
def test_receive_filter_processes_matching_events(
    mock_handle_room_started, mock_receive, mock_livekit_config, settings
):
    """Should process events when room name matches filter regex."""
    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX = (
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    )

    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = str(uuid.uuid4())
    mock_data.event = "room_started"
    mock_receive.return_value = mock_data

    service = LiveKitEventsService()
    service.receive(mock_request)

    mock_handle_room_started.assert_called_once()


@mock.patch.object(api.WebhookReceiver, "receive")
@mock.patch.object(LiveKitEventsService, "_handle_room_finished")
@mock.patch.object(LiveKitEventsService, "_handle_room_started")
def test_receive_ignores_connection_test_room(
    mock_handle_room_started,
    mock_handle_room_finished,
    mock_receive,
    mock_livekit_config,
    settings,
):
    """Should ignore all webhook events for connection test rooms in receive()."""

    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"

    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = f"{settings.CONNECTION_TEST_ROOM_PREFIX}-{uuid.uuid4()}"
    mock_data.event = "room_started"
    mock_receive.return_value = mock_data

    service = LiveKitEventsService()
    service.receive(mock_request)

    mock_handle_room_started.assert_not_called()
    mock_handle_room_finished.assert_not_called()


@mock.patch("core.services.presence.cache.delete")
def test_participant_left_clearing_gated_by_setting(mock_delete, service, settings):
    """PRESENCE_CLEAR_ON_PARTICIPANT_LEFT toggles eager presence invalidation."""
    data = mock.Mock()
    data.room.name = "room-name"
    data.participant.identity = "user-sub"

    settings.PRESENCE_CLEAR_ON_PARTICIPANT_LEFT = False
    service._handle_participant_left(data)  # pylint: disable=protected-access
    mock_delete.assert_not_called()

    settings.PRESENCE_CLEAR_ON_PARTICIPANT_LEFT = True
    service._handle_participant_left(data)  # pylint: disable=protected-access
    mock_delete.assert_called_once()


@mock.patch("core.services.presence.cache.delete")
def test_participant_left_without_identity_is_ignored(mock_delete, service, settings):
    """No cache operation when the webhook carries no identity."""
    settings.PRESENCE_CLEAR_ON_PARTICIPANT_LEFT = True
    data = mock.Mock()
    data.room.name = "room-name"
    data.participant.identity = ""

    service._handle_participant_left(data)  # pylint: disable=protected-access
    mock_delete.assert_not_called()
