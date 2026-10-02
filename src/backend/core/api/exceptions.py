"""Exceptions and guards shared by the API endpoints."""

from django.utils.translation import gettext_lazy as _

from rest_framework import exceptions, status

from core import models


class RoomSoftDeleted(exceptions.APIException):
    """Raised when the requested room has been soft deleted."""

    status_code = status.HTTP_410_GONE
    default_detail = _("This room has been deleted.")
    default_code = "room_deleted"


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
