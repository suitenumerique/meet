"""
Test RecordingEventsService service.
"""

# pylint: disable=redefined-outer-name,protected-access

import logging
from unittest import mock

import pytest

from core.factories import RecordingFactory
from core.recording.enums import RecordingWorkerEvent
from core.recording.services.recording_events import (
    RecordingEventsError,
    RecordingEventsService,
    RecordingNotSavableError,
)
from core.services.room_management import (
    RoomManagementException,
)
from core.utils import NotificationError

pytestmark = pytest.mark.django_db


@pytest.fixture
def service():
    """Initialize RecordingEventsService."""
    return RecordingEventsService()


@pytest.mark.parametrize(
    ("mode", "notification_type"),
    (
        ("screen_recording", "screenRecordingLimitReached"),
        ("transcript", "transcriptionLimitReached"),
    ),
)
@mock.patch("core.utils.notify_participants")
def test_handle_limit_reached_success(mock_notify, mode, notification_type, service):
    """Test _handle_limit_reached stops recording and notifies participants."""

    recording = RecordingFactory(status="active", mode=mode)
    service._handle_limit_reached(recording)

    assert recording.status == "stopped"
    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id), notification_data={"type": notification_type}
    )


@pytest.mark.parametrize(
    ("mode", "notification_type"),
    (
        ("screen_recording", "screenRecordingFailed"),
        ("transcript", "transcriptionFailed"),
    ),
)
@mock.patch("core.utils.notify_participants")
def test_handle_failed_success(mock_notify, mode, notification_type, service):
    """Test _handle_failed marks recording as failed and notifies participants."""

    recording = RecordingFactory(status="active", mode=mode)
    service._handle_failed(recording)

    assert recording.status == "failed"
    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id), notification_data={"type": notification_type}
    )


@pytest.mark.parametrize(
    ("mode", "notification_type"),
    (
        ("screen_recording", "screenRecordingAborted"),
        ("transcript", "transcriptionAborted"),
    ),
)
@mock.patch("core.utils.notify_participants")
def test_handle_aborted_success(mock_notify, mode, notification_type, service):
    """Test _handle_aborted marks recording as aborted and notifies participants."""

    recording = RecordingFactory(status="active", mode=mode)
    service._handle_aborted(recording)

    assert recording.status == "aborted"
    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id), notification_data={"type": notification_type}
    )


@pytest.mark.parametrize(
    ("mode", "notification_prefix"),
    (("screen_recording", "screenRecording"), ("transcript", "transcription")),
)
@pytest.mark.parametrize(
    ("handler", "expected_status", "event", "notification_suffix"),
    (
        ("_handle_limit_reached", "stopped", "limit reached", "LimitReached"),
        ("_handle_failed", "failed", "failed", "Failed"),
        ("_handle_aborted", "aborted", "aborted", "Aborted"),
    ),
)
@mock.patch("core.utils.notify_participants")
def test_handle_event_notification_error(  # noqa: PLR0913, PLR0917
    mock_notify,
    handler,
    expected_status,
    event,
    notification_suffix,
    mode,
    notification_prefix,
    service,
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Test handlers raise RecordingEventsError when notifying participants fails,
    while still applying the recording status of their event.
    """

    mock_notify.side_effect = NotificationError("Error notifying")

    recording = RecordingFactory(status="active", mode=mode)

    with pytest.raises(
        RecordingEventsError,
        match=rf"Failed to notify participants in room '.+' "
        rf"about recording {event} \(recording_id=.+\)",
    ):
        getattr(service, handler)(recording)

    assert recording.status == expected_status
    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id),
        notification_data={"type": f"{notification_prefix}{notification_suffix}"},
    )


@pytest.mark.parametrize("status", ["active", "stopped"])
@pytest.mark.parametrize(
    ("notify_return_value", "expected_status"),
    ((True, "notification_succeeded"), (False, "saved")),
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
def test_handle_successful_saves_recording(  # pylint: disable=too-many-arguments, too-many-positional-arguments
    mock_notify_external_services,
    notify_return_value,
    expected_status,
    status,
    service,
):
    """Test _handle_successful notifies external services and saves a savable recording."""

    mock_notify_external_services.return_value = notify_return_value

    recording = RecordingFactory(status=status)
    service._handle_successful(recording)

    mock_notify_external_services.assert_called_once_with(recording)

    recording.refresh_from_db()
    assert recording.status == expected_status


@pytest.mark.parametrize(
    "status",
    [
        "initiated",
        "saved",
        "notification_succeeded",
        "aborted",
        "failed",
        "failed_to_start",
    ],
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
def test_handle_successful_non_savable_recording(
    mock_notify_external_services, status, service
):
    """Test _handle_successful refuses recordings that are already saved or in error."""

    recording = RecordingFactory(status=status)

    with pytest.raises(RecordingNotSavableError):
        service._handle_successful(recording)

    mock_notify_external_services.assert_not_called()

    recording.refresh_from_db()
    assert recording.status == status


@pytest.mark.parametrize(
    ("event", "recording_status"),
    (
        (RecordingWorkerEvent.STARTED, "started"),
        (RecordingWorkerEvent.SAVING, "saving"),
    ),
)
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_update_syncs_room_metadata(
    mock_update_metadata, event, recording_status, service
):
    """Test handle_update updates the room's metadata."""

    recording = RecordingFactory(status="active")
    service.handle_update(recording, event)

    mock_update_metadata.assert_called_once_with(
        str(recording.room.id), {"recording_status": recording_status}
    )


@pytest.mark.parametrize(
    "event",
    (
        RecordingWorkerEvent.STARTING,
        RecordingWorkerEvent.COMPLETED,
        RecordingWorkerEvent.LIMIT_REACHED,
        RecordingWorkerEvent.ABORTED,
        RecordingWorkerEvent.FAILED,
    ),
)
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_update_ignores_events_without_a_metadata_status(
    mock_update_metadata, event, service
):
    """Test handle_update doesn't update metadata for events it doesn't match."""

    recording = RecordingFactory(status="active")
    service.handle_update(recording, event)

    mock_update_metadata.assert_not_called()


@pytest.mark.parametrize(
    ("event", "initial_status", "expected_status", "notification_type"),
    (
        (RecordingWorkerEvent.LIMIT_REACHED, "active", "saved", "LimitReached"),
        (RecordingWorkerEvent.LIMIT_REACHED, "stopped", "saved", None),
        (RecordingWorkerEvent.LIMIT_REACHED, "saved", "saved", None),
        (RecordingWorkerEvent.ABORTED, "active", "aborted", "Aborted"),
        (RecordingWorkerEvent.ABORTED, "failed_to_stop", "failed_to_stop", None),
        (RecordingWorkerEvent.FAILED, "active", "failed", "Failed"),
        (RecordingWorkerEvent.FAILED, "stopped", "failed", "Failed"),
        (RecordingWorkerEvent.FAILED, "aborted", "aborted", None),
        (RecordingWorkerEvent.COMPLETED, "active", "saved", None),
        (RecordingWorkerEvent.COMPLETED, "saved", "saved", None),
    ),
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
def test_handle_terminal_event_dispatches_on_event_and_status(  # noqa: PLR0913, PLR0917
    mock_notify,
    mock_notify_external_services,
    event,
    initial_status,
    expected_status,
    notification_type,
    service,
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Test handle_terminal_event chooses the right handler from the event and status."""

    mock_notify_external_services.return_value = False

    recording = RecordingFactory(status=initial_status, mode="screen_recording")
    service.handle_terminal_event(recording, event)

    recording.refresh_from_db()
    assert recording.status == expected_status

    if notification_type is None:
        mock_notify.assert_not_called()
    else:
        mock_notify.assert_called_once_with(
            room_name=str(recording.room.id),
            notification_data={"type": f"screenRecording{notification_type}"},
        )


@pytest.mark.parametrize(
    "event",
    (
        RecordingWorkerEvent.STARTING,
        RecordingWorkerEvent.STARTED,
        RecordingWorkerEvent.SAVING,
    ),
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
def test_handle_terminal_event_ignores_non_terminal_events(
    mock_notify, mock_notify_external_services, event, service, caplog
):
    """Test handle_terminal_event refuses non-terminal events."""

    recording = RecordingFactory(status="active")

    with caplog.at_level(logging.WARNING):
        service.handle_terminal_event(recording, event)

    assert f"Ignoring non-terminal event {event.value}" in caplog.text
    mock_notify.assert_not_called()
    mock_notify_external_services.assert_not_called()

    recording.refresh_from_db()
    assert recording.status == "active"


@pytest.mark.parametrize(
    ("event", "expected_status"),
    (
        (RecordingWorkerEvent.LIMIT_REACHED, "saved"),
        (RecordingWorkerEvent.ABORTED, "aborted"),
        (RecordingWorkerEvent.FAILED, "failed"),
    ),
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
def test_handle_terminal_event_survives_a_notification_failure(  # noqa: PLR0913, PLR0917
    mock_notify,
    mock_notify_external_services,
    event,
    expected_status,
    service,
    caplog,
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Test handle_terminal_event logs a notification failure instead of raising.

    The recording status must still be persisted: participants missing their
    notification should not disturb recording.
    """

    mock_notify_external_services.return_value = False
    mock_notify.side_effect = NotificationError("Error notifying")

    recording = RecordingFactory(status="active")

    with caplog.at_level(logging.ERROR):
        service.handle_terminal_event(recording, event)

    assert f"Failed to notify participants that recording {recording.id}" in caplog.text

    recording.refresh_from_db()
    assert recording.status == expected_status


@pytest.mark.parametrize(
    "status",
    ["failed_to_start", "aborted", "failed", "failed_to_stop", "saved", "initiated"],
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
def test_handle_terminal_event_ignores_a_non_savable_recording(
    mock_notify_external_services, status, service, caplog
):
    """Test handle_terminal_event handles a redelivered event idempotently.

    A terminal event may be redelivered for an already finalized recording;
    this must not raise, otherwise the webhook would 500 and be retried.
    """

    recording = RecordingFactory(status=status)

    with caplog.at_level(logging.WARNING):
        service.handle_terminal_event(recording, RecordingWorkerEvent.COMPLETED)

    assert f"Recording {recording.id} is not savable" in caplog.text
    mock_notify_external_services.assert_not_called()

    recording.refresh_from_db()
    assert recording.status == status


@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_update_survives_a_metadata_failure(
    mock_update_metadata, service, caplog
):
    """Test handle_update logs a metadata failure instead of raising."""

    mock_update_metadata.side_effect = RoomManagementException("Error updating")

    recording = RecordingFactory(status="active")

    with caplog.at_level(logging.ERROR):
        service.handle_update(recording, RecordingWorkerEvent.SAVING)

    assert "Failed to update room's metadata" in caplog.text


@pytest.mark.parametrize(
    ("event", "expected_level"),
    (
        (RecordingWorkerEvent.ABORTED, logging.INFO),
        (RecordingWorkerEvent.FAILED, logging.ERROR),
    ),
)
def test_log_worker_error_reports_an_unsuccessful_event(
    event, expected_level, service, caplog
):
    """Test log_worker_error records the reason the recording did not succeed."""

    recording = RecordingFactory(status="active", mode="screen_recording")

    with caplog.at_level(logging.INFO):
        service.log_worker_error(
            recording, event, error="could not connect to the room", error_code=500
        )

    assert (
        f"Recording worker reported {event.value} for recording {recording.id}"
        in caplog.text
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
    "event",
    (
        RecordingWorkerEvent.STARTING,
        RecordingWorkerEvent.STARTED,
        RecordingWorkerEvent.SAVING,
        RecordingWorkerEvent.COMPLETED,
        RecordingWorkerEvent.LIMIT_REACHED,
        None,
    ),
)
def test_log_worker_error_stays_quiet_on_anything_else(event, service, caplog):
    """Test log_worker_error ignores events other than FAILED and ABORTED."""

    recording = RecordingFactory(status="active")

    with caplog.at_level(logging.INFO):
        service.log_worker_error(recording, event, error="some error", error_code=500)

    assert "Recording worker reported" not in caplog.text
