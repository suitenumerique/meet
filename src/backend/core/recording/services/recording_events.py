"""Recording-related Events Service"""

from logging import getLogger

from core import models, utils
from core.models import Recording
from core.recording.enums import (
    UNSUCCESSFUL_EVENTS,
    RecordingWorkerEvent,
)
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


# Notification sent to the room's participants, per event and recording mode.
NOTIFICATION_PREFIXES = {
    models.RecordingModeChoices.SCREEN_RECORDING: "screenRecording",
    models.RecordingModeChoices.TRANSCRIPT: "transcription",
}
NOTIFICATION_SUFFIXES = {
    RecordingWorkerEvent.LIMIT_REACHED: "LimitReached",
    RecordingWorkerEvent.FAILED: "Failed",
    RecordingWorkerEvent.ABORTED: "Aborted",
}


def get_notification_type(recording_mode, event):
    """Generate corresponding notification type string."""
    try:
        return f"{NOTIFICATION_PREFIXES[recording_mode]}{NOTIFICATION_SUFFIXES[event]}"
    except KeyError:
        return None


# Recording status in the room's metadata, per event.
ROOM_METADATA_RECORDING_STATUSES = {
    RecordingWorkerEvent.STARTED: "started",
    RecordingWorkerEvent.SAVING: "saving",
}


class RecordingEventsService:
    """Handles recording-related worker events.

    Two entry points: `handle_update` for the events a running recording
    reports, and `handle_terminal_event` for the one ending it.
    """

    @staticmethod
    def log_worker_error(recording, event, error=None, error_code=None):
        """Log FAILED at error level and expected ABORTED outcomes at info level."""

        if event == RecordingWorkerEvent.FAILED:
            log = logger.error
        elif event == RecordingWorkerEvent.ABORTED:
            log = logger.info
        else:
            return

        log(
            "Recording worker reported %s for recording %s (room=%s, mode=%s): %s (error_code=%s)",
            event.value,
            recording.id,
            recording.room.id,
            recording.mode,
            error or "no error reported",
            error_code or "no error_code reported",
        )

    @staticmethod
    def _notify_participants(recording: Recording, event: RecordingWorkerEvent):
        """Notify the room's participants that a recording ended on the given event."""
        recording_mode = recording.options.get("original_mode", None) or recording.mode

        notification_type = get_notification_type(recording_mode, event)
        if not notification_type:
            logger.warning(
                "Could not find notification type for: "
                "room=%s, recording_id=%s, mode=%s, event=%s",
                recording.room.id,
                recording.id,
                recording_mode,
                event.value,
            )
            return

        try:
            utils.notify_participants(
                room_name=str(recording.room.id),
                notification_data={"type": notification_type},
            )
        except utils.NotificationError as e:
            raise RecordingEventsError(
                f"Failed to notify participants in room '{recording.room.id}' about "
                f"recording {event.value} (recording_id={recording.id})"
            ) from e

    @staticmethod
    def _log_notification_failure(recording, event: RecordingWorkerEvent):
        """Log a participant notification error on an unsuccessful recording."""

        logger.exception(
            "Failed to notify participants that recording %s %s (room=%s)",
            recording.id,
            event.value,
            recording.room.id,
        )

    @staticmethod
    def handle_update(recording: Recording, event: RecordingWorkerEvent):
        """Handle non-terminal worker events and sync recording state to room metadata.

        Terminal events are dispatched through `handle_terminal_event` instead.
        """

        room_name = str(recording.room.id)

        recording_status = ROOM_METADATA_RECORDING_STATUSES.get(event)
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

    def handle_terminal_event(self, recording: Recording, event: RecordingWorkerEvent):
        """Run the appropriate handlers for a terminal event, given the recording's state."""

        if not RecordingWorkerEvent.is_terminal(event):
            logger.warning(
                "Ignoring non-terminal event %s dispatched as a terminal event "
                "for recording %s.",
                event.value,
                recording.id,
            )
            return

        if event in UNSUCCESSFUL_EVENTS:
            self._flag_unsuccessful_recording(recording, event)
        else:
            self._save_successful_recording(recording, event)

    def _flag_unsuccessful_recording(
        self, recording: Recording, event: RecordingWorkerEvent
    ):
        """Persist the outcome of a recording the worker announced as unsuccessful."""

        # Aborted
        if event == RecordingWorkerEvent.ABORTED:
            if recording.status == models.RecordingStatusChoices.ACTIVE:
                self._apply_outcome(recording, event, self._handle_aborted)
            return

        # Failed
        if event == RecordingWorkerEvent.FAILED:
            if recording.is_savable():
                self._apply_outcome(recording, event, self._handle_failed)
            return

        logger.error(
            "Unsuccessful event %s has no handler; recording %s keeps status '%s'.",
            event.value,
            recording.id,
            recording.status,
        )

    def _save_successful_recording(
        self, recording: Recording, event: RecordingWorkerEvent
    ):
        """Save a recording whose media file the worker made available."""

        # Limit reached
        if (
            event == RecordingWorkerEvent.LIMIT_REACHED
            and recording.status == models.RecordingStatusChoices.ACTIVE
        ):
            self._apply_outcome(recording, event, self._handle_limit_reached)

        try:
            self._handle_successful(recording)
        except RecordingNotSavableError:
            logger.warning(
                "Recording %s is not savable on a completed recording "
                "(already saved or in an error state); ignoring.",
                recording.id,
            )

    def _apply_outcome(
        self, recording: Recording, event: RecordingWorkerEvent, handler
    ):
        """Keep notification failure non-fatal."""

        try:
            handler(recording)
        except RecordingEventsError:
            self._log_notification_failure(recording, event)

    @classmethod
    def _handle_limit_reached(cls, recording: Recording):
        """Stop recording and notify participants when limit is reached."""

        recording.status = models.RecordingStatusChoices.STOPPED
        recording.save()

        cls._notify_participants(recording, RecordingWorkerEvent.LIMIT_REACHED)

    @classmethod
    def _handle_failed(cls, recording: Recording):
        """Set recording status to failed, matching the worker event, and notify participants.

        FAILED: used when an actual runtime/pipeline error occurs after the
        recording has started
        """
        recording.status = models.RecordingStatusChoices.FAILED
        recording.save()

        cls._notify_participants(recording, RecordingWorkerEvent.FAILED)

    @classmethod
    def _handle_aborted(cls, recording: Recording):
        """Set recording status to aborted, matching the worker event, and notify participants.

        ABORTED: used when the worker stops before it ever became
        active/recording
        """
        recording.status = models.RecordingStatusChoices.ABORTED
        recording.save()

        cls._notify_participants(recording, RecordingWorkerEvent.ABORTED)

    @staticmethod
    def _handle_successful(recording: Recording):
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
