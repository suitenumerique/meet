"""
Test RecordingEventsService service.
"""

# pylint: disable=W0621

from unittest import mock

import pytest

from core.factories import RecordingFactory
from core.recording.services.recording_events import (
    RecordingEventsError,
    RecordingEventsService,
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
        ("screen_recording", "ScreenRecordingLimitReached"),
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
        ("screen_recording", "ScreenRecordingLimitReached"),
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
