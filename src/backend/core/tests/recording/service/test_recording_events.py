"""
Test RecordingEventsService service.
"""

# pylint: disable=redefined-outer-name

from unittest import mock

import pytest

from core.factories import RecordingFactory
from core.recording.services.recording_events import (
    RecordingEventsError,
    RecordingEventsService,
    RecordingNotSavableError,
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
    """Test handle_limit_reached stops recording and notifies participants."""

    recording = RecordingFactory(status="active", mode=mode)
    service.handle_limit_reached(recording)

    assert recording.status == "stopped"
    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id), notification_data={"type": notification_type}
    )


@pytest.mark.parametrize(
    ("mode", "notification_type"),
    (
        ("screen_recording", "screenRecordingLimitReached"),
        ("transcript", "transcriptionLimitReached"),
    ),
)
@mock.patch("core.utils.notify_participants")
def test_handle_limit_reached_error(mock_notify, mode, notification_type, service):
    """Test handle_limit_reached raises RecordingEventsError when notification fails."""

    mock_notify.side_effect = NotificationError("Error notifying")

    recording = RecordingFactory(status="active", mode=mode)

    with pytest.raises(
        RecordingEventsError,
        match=r"Failed to notify participants in room '.+' "
        r"about recording limit reached \(recording_id=.+\)",
    ):
        service.handle_limit_reached(recording)

    assert recording.status == "stopped"
    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id), notification_data={"type": notification_type}
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
def test_handle_complete_saves_recording(  # pylint: disable=too-many-arguments, too-many-positional-arguments
    mock_notify_external_services,
    notify_return_value,
    expected_status,
    status,
    service,
):
    """Test handle_complete notifies external services and saves a savable recording."""

    mock_notify_external_services.return_value = notify_return_value

    recording = RecordingFactory(status=status)
    service.handle_complete(recording)

    mock_notify_external_services.assert_called_once_with(recording)

    recording.refresh_from_db()
    assert recording.status == expected_status


@pytest.mark.parametrize(
    "status",
    ["initiated", "saved", "notification_succeeded", "aborted", "failed_to_start"],
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
def test_handle_complete_non_savable_recording(
    mock_notify_external_services, status, service
):
    """Test handle_complete refuses recordings that are already saved or in error."""

    recording = RecordingFactory(status=status)

    with pytest.raises(RecordingNotSavableError):
        service.handle_complete(recording)

    mock_notify_external_services.assert_not_called()

    recording.refresh_from_db()
    assert recording.status == status
