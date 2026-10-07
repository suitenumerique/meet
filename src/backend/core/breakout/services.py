"""Open and close breakout sessions, and announce them in the meeting's metadata."""

import contextlib
from logging import getLogger

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from rest_framework import exceptions

from core import models
from core.recording.worker.exceptions import RecordingStopError
from core.recording.worker.factories import get_worker_service
from core.recording.worker.mediator import WorkerServiceMediator
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)

logger = getLogger(__name__)

METADATA_KEY = "breakout"


class SessionAlreadyActive(exceptions.APIException):
    """The meeting already has an active breakout session."""

    status_code = 409
    default_detail = _("This meeting already has an active breakout session.")


class RecordingInProgress(exceptions.APIException):
    """A recording would capture every breakout room, so the two never overlap."""

    status_code = 409
    default_detail = _("Stop the recording before opening breakout rooms.")


class SessionClosed(exceptions.APIException):
    """The breakout session has closed, so nobody moves in it."""

    status_code = 409
    default_detail = _("These breakout rooms are closed.")


class MediaServerError(exceptions.APIException):
    """A media server call failed; the detail never carries the upstream error."""

    status_code = 503
    default_detail = _("The media server could not be reached. Try again.")


def active_sessions(room_id):
    """The meeting's active breakout session, as a queryset of zero or one."""
    return models.BreakoutSession.objects.filter(
        room_id=room_id, status=models.BreakoutSessionStatusChoices.ACTIVE
    )


def has_active_session(room):
    """True while the meeting is split into breakout rooms."""
    return active_sessions(room.id).exists()


def close_active_sessions(room_id, clear_metadata=False):
    """Close the meeting's split; clear_metadata also takes its key off a live room."""
    sessions = active_sessions(room_id)
    # LiveKit reloads a room with its metadata, so every browser would stay split.
    # A failed removal keeps the session active, so a host's Close tries again.
    if clear_metadata and sessions.exists():
        _write_metadata(room_id, remove_keys=[METADATA_KEY])
    now = timezone.now()
    sessions.update(
        status=models.BreakoutSessionStatusChoices.CLOSED,
        closed_at=now,
        updated_at=now,
    )


def lock_room_row(room):
    """Hold the meeting's row until the transaction ends.

    Opening, moving, closing and starting a recording all take it, so none slips
    past another's check.
    """
    models.Room.objects.select_for_update().filter(pk=room.pk).first()


def _split_metadata(session):
    """The metadata every browser reads, as the session's rows hold it.

    For two rooms, alice in the first and bob in the second:
    {"session_id": "<uuid>", "rooms": ["Room 1", "Room 2"],
     "assignments": {"alice": 0, "bob": 1}}
    """
    return {
        "session_id": str(session.id),
        "rooms": [room.name for room in session.rooms.order_by("position")],
        "assignments": dict(
            session.assignments.values_list("identity", "breakout_room__position")
        ),
    }


def _write_metadata(room_id, **changes):
    """Change the meeting's metadata through its one writer; False when it is not live."""
    try:
        RoomManagement.update_metadata(str(room_id), **changes)
    except RoomNotFoundException:
        return False
    except Exception as error:
        logger.exception("Breakout metadata write to room %s failed", room_id)
        raise MediaServerError() from error
    return True


def _recorder_running(room_id):
    """True while the media server records the meeting, whatever its rows say."""
    try:
        return RoomManagement.has_active_egress(str(room_id))
    except RoomManagementException as error:
        raise MediaServerError() from error


def _stop_recordings(room):
    """Stop the meeting's active recordings, for a host who opens rooms over one."""
    for recording in room.recordings.filter(
        status=models.RecordingStatusChoices.ACTIVE
    ):
        mediator = WorkerServiceMediator(get_worker_service(mode=recording.mode))
        try:
            mediator.stop(recording)
        except RecordingStopError as error:
            raise MediaServerError() from error


def open_session(room, user, rooms, stop_recording=False):
    """Write the session and its assignments, then announce them to the meeting.

    1. With stop_recording, stop the active recording: the host was warned.
    2. Refuse while a recorder runs, or a recording starts.
    3. Under the meeting's row lock, store the session, its rooms and who goes where.
    4. Write the split into the LiveKit room's metadata, which every browser reads.
       A failed or unanswered write deletes the session again.
    """
    if stop_recording:
        _stop_recordings(room)
    # A recorder whose stop failed still runs with no active recording row.
    if _recorder_running(room.id):
        raise RecordingInProgress()
    try:
        with transaction.atomic():
            lock_room_row(room)
            if has_active_session(room):
                raise SessionAlreadyActive()
            if room.recordings.filter(
                status__in=[
                    models.RecordingStatusChoices.ACTIVE,
                    models.RecordingStatusChoices.INITIATED,
                ]
            ).exists():
                raise RecordingInProgress()
            session = models.BreakoutSession.objects.create(room=room, created_by=user)
            breakout_rooms = models.BreakoutRoom.objects.bulk_create(
                models.BreakoutRoom(
                    session=session, name=data["name"], position=position
                )
                for position, data in enumerate(rooms)
            )
            models.BreakoutAssignment.objects.bulk_create(
                models.BreakoutAssignment(
                    session=session,
                    breakout_room=breakout_room,
                    identity=participant["identity"],
                    name=participant["name"],
                )
                for data, breakout_room in zip(rooms, breakout_rooms, strict=True)
                for participant in data["participants"]
            )
    except IntegrityError as error:
        raise SessionAlreadyActive() from error

    try:
        is_live = _write_metadata(
            room.id, metadata={METADATA_KEY: _split_metadata(session)}
        )
    except MediaServerError:
        # A write cut off by its deadline may still have landed; take it back.
        # Should that fail too, the session stays active, so a close retries.
        with contextlib.suppress(MediaServerError):
            _write_metadata(room.id, remove_keys=[METADATA_KEY])
            session.delete()
        raise
    # No LiveKit room: nobody is in the meeting to split.
    if not is_live:
        session.delete()
        raise MediaServerError()
    return session


def move_participant(session, identity, name, position):
    """Send one participant to the room at position, or to the main room on None."""
    with transaction.atomic():
        lock_room_row(session.room)
        if not active_sessions(session.room_id).filter(pk=session.pk).exists():
            raise SessionClosed()
        if position is None:
            session.assignments.filter(identity=identity).delete()
        else:
            try:
                breakout_room = session.rooms.get(position=position)
            except models.BreakoutRoom.DoesNotExist as error:
                raise exceptions.ValidationError(
                    {"room": _("This room does not exist.")}
                ) from error
            models.BreakoutAssignment.objects.update_or_create(
                session=session,
                identity=identity,
                defaults={"breakout_room": breakout_room, "name": name},
            )
        # A failed write rolls the rows back; one that lands after its deadline
        # is written over by the next move or close.
        if not _write_metadata(
            session.room_id, metadata={METADATA_KEY: _split_metadata(session)}
        ):
            raise MediaServerError()
    return session


def close_session(session):
    """Remove the split from the metadata, then mark the session closed.

    Closing a closed session does nothing. A close whose metadata removal fails
    leaves the session active, so closing it again tries again.
    """
    # The row lock a move holds keeps it from writing the split back after this.
    with transaction.atomic():
        lock_room_row(session.room)
        session.refresh_from_db(fields=["status"])
        if session.status == models.BreakoutSessionStatusChoices.CLOSED:
            return session
        _write_metadata(session.room_id, remove_keys=[METADATA_KEY])
        session.status = models.BreakoutSessionStatusChoices.CLOSED
        session.closed_at = timezone.now()
        session.save(update_fields=["status", "closed_at", "updated_at"])
    return session
