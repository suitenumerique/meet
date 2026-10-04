"""Open and close breakout sessions, and announce them in the meeting's metadata."""

import contextlib
from logging import getLogger

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from rest_framework import exceptions

from core import models
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


def end_sessions(room_id):
    """Close the split of a meeting whose LiveKit room ended, its metadata with it."""
    now = timezone.now()
    active_sessions(room_id).update(
        status=models.BreakoutSessionStatusChoices.CLOSED,
        closed_at=now,
        updated_at=now,
    )


def lock_room(room):
    """Hold the meeting's row until the transaction ends.

    Opening a split and starting a recording both take it, so neither slips past
    the other's check.
    """
    models.Room.objects.select_for_update().filter(pk=room.pk).first()


def _signal(session, rooms):
    """The metadata every browser reads: the rooms' names and each identity's room."""
    return {
        "session_id": str(session.id),
        "rooms": [data["name"] for data in rooms],
        "assignments": {
            participant["identity"]: position
            for position, data in enumerate(rooms)
            for participant in data["participants"]
        },
    }


def _write_signal(room_id, **changes):
    """Change the meeting's metadata through its one writer; False when it is not live."""
    try:
        RoomManagement.update_metadata(str(room_id), **changes)
    except RoomNotFoundException:
        return False
    except Exception as error:
        logger.exception("Breakout signal write to room %s failed", room_id)
        raise MediaServerError() from error
    return True


def _recorder_running(room_id):
    """True while the media server records the meeting, whatever its rows say."""
    try:
        return RoomManagement.has_active_egress(str(room_id))
    except RoomManagementException as error:
        raise MediaServerError() from error


def open_session(room, user, rooms):
    """Write the session and its assignments, then announce them to the meeting."""
    # A recorder whose stop failed still runs with no active recording row.
    if _recorder_running(room.id):
        raise RecordingInProgress()
    try:
        with transaction.atomic():
            lock_room(room)
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
        is_live = _write_signal(
            room.id, metadata={METADATA_KEY: _signal(session, rooms)}
        )
    except MediaServerError:
        # A write cut off by its deadline may still have landed; take it back.
        # Should that fail too, the session stays active, so a close retries.
        with contextlib.suppress(MediaServerError):
            _write_signal(room.id, remove_keys=[METADATA_KEY])
            session.delete()
        raise
    if not is_live:
        session.delete()
        raise MediaServerError()
    return session


def close_session(session):
    """Remove the signal, then mark the session closed.

    Closing a closed session does nothing. A close whose signal removal fails
    leaves the session active, so closing it again tries again.
    """
    if session.status == models.BreakoutSessionStatusChoices.CLOSED:
        return session
    _write_signal(session.room_id, remove_keys=[METADATA_KEY])
    session.status = models.BreakoutSessionStatusChoices.CLOSED
    session.closed_at = timezone.now()
    session.save(update_fields=["status", "closed_at", "updated_at"])
    return session
