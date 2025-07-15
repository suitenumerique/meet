"""Recording-related LiveKit Events Service"""

from logging import getLogger

from core import models, utils

logger = getLogger(__name__)


class RecordingEventsError(Exception):
    """Recording event handling fails."""


class RecordingEventsService:
    """Handles recording-related Livekit webhook events."""

    @staticmethod
    def handle_limit_reached(recording):
        """Stop recording and notify participants when limit is reached."""

        recording.status = models.RecordingStatusChoices.STOPPED
        recording.save()

        notification_mapping = {
            models.RecordingModeChoices.SCREEN_RECORDING: "ScreenRecordingLimitReached",
            models.RecordingModeChoices.TRANSCRIPT: "transcriptionLimitReached",
        }

        notification_type = notification_mapping.get(recording.mode)
        if not notification_type:
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
