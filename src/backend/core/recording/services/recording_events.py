"""Recording-related LiveKit Events Service"""

# pylint: disable=no-member

from enum import Enum
from logging import getLogger

from livekit import api

from core import models, utils
from core.models import Recording
from core.recording.event.notification import notification_service
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)

logger = getLogger(__name__)


class RecordingEventsError(Exception):
    """Recording event handling fails."""


class RecordingNotSavableError(Exception):
    """Recording cannot be saved because it is either in an error state or has already been saved"""


class RecordingEvent(Enum):
    """Recording outcomes participants are notified about."""

    LIMIT_REACHED = "limit reached"
    FAILED = "failed"
    ABORTED = "aborted"


# Notification sent to the room's participants, per event and recording mode.
NOTIFICATION_TYPES = {
    RecordingEvent.LIMIT_REACHED: {
        models.RecordingModeChoices.SCREEN_RECORDING: "screenRecordingLimitReached",
        models.RecordingModeChoices.TRANSCRIPT: "transcriptionLimitReached",
    },
    RecordingEvent.FAILED: {
        models.RecordingModeChoices.SCREEN_RECORDING: "screenRecordingFailed",
        models.RecordingModeChoices.TRANSCRIPT: "transcriptionFailed",
    },
    RecordingEvent.ABORTED: {
        models.RecordingModeChoices.SCREEN_RECORDING: "screenRecordingAborted",
        models.RecordingModeChoices.TRANSCRIPT: "transcriptionAborted",
    },
}


class RecordingEventsService:
    """Handles recording-related LiveKit webhook events."""

    @staticmethod
    def _notify_participants(recording: Recording, event: RecordingEvent):
        """Notify the room's participants that a recording ended on the given event."""

        notification_type = NOTIFICATION_TYPES[event].get(recording.mode)
        if not notification_type:
            logger.warning(
                "Could not find notification type for: "
                "room=%s, recording_id=%s, mode=%s, event=%s",
                recording.room.id,
                recording.id,
                recording.mode,
                event.value,
            )
            return

        try:
            utils.notify_participants(
                room_name=str(recording.room.id),
                notification_data={"type": notification_type},
            )
        except utils.NotificationError as e:
            logger.exception(
                "Failed to notify participants about recording %s: "
                "room=%s, recording_id=%s, mode=%s",
                event.value,
                recording.room.id,
                recording.id,
                recording.mode,
            )
            raise RecordingEventsError(
                f"Failed to notify participants in room '{recording.room.id}' about "
                f"recording {event.value} (recording_id={recording.id})"
            ) from e

    @staticmethod
    def handle_update(recording: Recording, egress_status):
        """Handle egress status updates and sync recording state to room metadata.

        Egress updates are sent exclusively for statuses EGRESS_ACTIVE and EGRESS_ENDING.
        """

        room_name = str(recording.room.id)

        status_mapping = {
            api.EgressStatus.EGRESS_ACTIVE: "started",
            api.EgressStatus.EGRESS_ENDING: "saving",
        }

        recording_status = status_mapping.get(egress_status)
        if recording_status:
            try:
                RoomManagement.update_metadata(
                    room_name, {"recording_status": recording_status}
                )
            except RoomNotFoundException:
                logger.info(
                    "LiveKit room %s no longer exists, skipping metadata update",
                    room_name,
                )
            except RoomManagementException as e:
                logger.exception("Failed to update room's metadata: %s", e)

    @classmethod
    def handle_limit_reached(cls, recording: Recording):
        """Stop recording and notify participants when limit is reached."""

        recording.status = models.RecordingStatusChoices.STOPPED
        recording.save()

        cls._notify_participants(recording, RecordingEvent.LIMIT_REACHED)

    @classmethod
    def handle_failed(cls, recording: Recording):
        """Set recording status to failed, matching egress status, and notify participants.

        EGRESS_FAILED: used when an actual runtime/pipeline error occurs after the
        egress has started
        """
        recording.status = models.RecordingStatusChoices.FAILED
        recording.save()

        cls._notify_participants(recording, RecordingEvent.FAILED)

    @classmethod
    def handle_aborted(cls, recording: Recording):
        """Set recording status to aborted, matching egress status, and notify participants.

        EGRESS_ABORTED: used when the egress stops before it ever became
        active/recording
        """
        recording.status = models.RecordingStatusChoices.ABORTED
        recording.save()

        cls._notify_participants(recording, RecordingEvent.ABORTED)

    @staticmethod
    def handle_savable(recording: Recording):
        """Notify external services and save recording."""

        if not recording.is_savable():
            raise RecordingNotSavableError

        # Attempt to notify external services about the recording
        # This is a non-blocking operation - failures are logged but don't interrupt the flow
        notification_succeeded = notification_service.notify_external_services(
            recording
        )

        recording.status = (
            models.RecordingStatusChoices.NOTIFICATION_SUCCEEDED
            if notification_succeeded
            else models.RecordingStatusChoices.SAVED
        )
        recording.save()
