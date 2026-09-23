"""Enums related to recordings."""

from enum import Enum


class FileExtension(Enum):
    """Enum for file extensions used in recordings."""

    OGG = "ogg"
    MP4 = "mp4"


class RecordingWorkerEvent(Enum):
    """Lifecycle events a recording worker reports about a recording.

    It is intended to be free of SFU-specific vocabulary.
    """

    # The worker accepted the request but is not recording yet.
    STARTING = "starting"
    # The worker is recording.
    STARTED = "started"
    # The worker stopped recording and is flushing the media file.
    SAVING = "saving"

    # The recording ended, its media file is available.
    COMPLETED = "completed"
    # The recording ended on its configured limit, its media file is available.
    LIMIT_REACHED = "limit reached"
    # The worker stopped before it ever started recording, there is no media file.
    ABORTED = "aborted"
    # The worker hit a runtime error once recording had started; its media file
    # may be available.
    FAILED = "failed"

    @classmethod
    def is_terminal(cls, event):
        """Determine if the event ends the recording's lifecycle (successful or not)."""

        return event in TERMINAL_EVENTS


SUCCESSFUL_EVENTS = frozenset(
    {
        RecordingWorkerEvent.COMPLETED,
        RecordingWorkerEvent.LIMIT_REACHED,
    }
)

UNSUCCESSFUL_EVENTS = frozenset(
    {
        RecordingWorkerEvent.ABORTED,
        RecordingWorkerEvent.FAILED,
    }
)

TERMINAL_EVENTS = SUCCESSFUL_EVENTS | UNSUCCESSFUL_EVENTS
