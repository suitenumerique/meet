"""Recording-related LiveKit Events Service"""

# pylint: disable=no-member

from logging import getLogger

from livekit import api

from core import models, utils
from core.models import Recording
from core.recording.event.notification import notification_service

logger = getLogger(__name__)


class RecordingEventsError(Exception):
    """Recording event handling fails."""


class RecordingNotSavableError(Exception):
    """Recording cannot be saved because it is either in an error state or has already been saved"""


class RecordingEventsService:
    """Handles recording-related LiveKit webhook events."""

    @staticmethod
    def handle_update(recording: Recording, egress_status):
        """Handle egress update and sync recording state to room metadata.

        Egress updates are sent for statuses EGRESS_ACTIVE and EGRESS_ENDING.
        """

        room_name = str(recording.room.id)

        status_mapping = {
            api.EgressStatus.EGRESS_ACTIVE: "started",
            api.EgressStatus.EGRESS_ENDING: "saving",
        }

        recording_status = status_mapping.get(egress_status)
        if recording_status:
            try:
                utils.update_room_metadata(
                    room_name, {"recording_status": recording_status}
                )
            except utils.MetadataUpdateException as e:
                logger.exception("Failed to update room's metadata: %s", e)

    @staticmethod
    def handle_limit_reached(recording: Recording):
        """Stop recording and notify participants when limit is reached."""

        recording.status = models.RecordingStatusChoices.STOPPED
        recording.save()

        notification_mapping = {
            models.RecordingModeChoices.SCREEN_RECORDING: "screenRecordingLimitReached",
            models.RecordingModeChoices.TRANSCRIPT: "transcriptionLimitReached",
        }

        notification_type = notification_mapping.get(recording.mode)
        if not notification_type:
            logger.warning(
                "Could not find notification type for: "
                "room=%s, recording_id=%s, mode=%s",
                recording.room.id,
                recording.id,
                recording.mode,
            )
            return

        try:
            utils.notify_participants(
                room_name=str(recording.room.id),
                notification_data={"type": notification_type},
            )
        except utils.NotificationError as e:
            logger.exception(
                "Failed to notify participants about recording limit reached: "
                "room=%s, recording_id=%s, mode=%s",
                recording.room.id,
                recording.id,
                recording.mode,
            )
            raise RecordingEventsError(
                f"Failed to notify participants in room '{recording.room.id}' about "
                f"recording limit reached (recording_id={recording.id})"
            ) from e

    @staticmethod
    def handle_failed(recording: Recording):
        """Set recording status to failed, matching egress status."""
        recording.status = models.RecordingStatusChoices.FAILED
        recording.save()

    @staticmethod
    def handle_aborted(recording: Recording):
        """Set recording status to aborted, matching egress status."""
        recording.status = models.RecordingStatusChoices.ABORTED
        recording.save()

    @staticmethod
    def handle_complete(recording: Recording):
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
