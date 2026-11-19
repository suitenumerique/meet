"""Exceptions and guards shared by the API endpoints."""

from django.utils.translation import gettext_lazy as _

from rest_framework import exceptions, status

from core import models


class RoomSoftDeleted(exceptions.APIException):
    """Raised when the requested room has been soft deleted."""

    status_code = status.HTTP_410_GONE
    default_detail = _("This room has been deleted.")
    default_code = "room_deleted"


class LiveKitRoomUnavailable(exceptions.APIException):
    """Raised when the LiveKit room to hand out credentials for cannot be
    joined for now: it cannot be placed, or created on its LiveKit cluster."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = _("This room cannot be joined for now, please try again.")
    default_code = "livekit_room_unavailable"


class MeetingEnded(exceptions.APIException):
    """Raised when the LiveKit room a frontend reports deleted ended its meeting."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = _("This meeting has ended.")
    default_code = "meeting_ended"


def ensure_room_not_deleted(resource):
    """Raise a 410 Gone if the resource is a soft-deleted room.

    Accepts a room or its parent resource, as referenced by accesses. Call it
    after permissions are checked, to avoid revealing room.
    """
    if isinstance(resource, models.Room):
        room = resource
    else:
        room = getattr(resource, "room", None)

    if room is not None and room.is_deleted:
        raise RoomSoftDeleted()
