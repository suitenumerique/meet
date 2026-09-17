"""Work the web application does once, as it starts serving."""

import logging

from django.utils import timezone

from core import models

logger = logging.getLogger(__name__)


def forbid_public_rooms():
    """Move every public room, and every public user default, to trusted.

    Runs as the web application starts, so the restart that turns
    ALLOW_PUBLIC_ROOMS off rewrites the rows. The change is one way: turning
    it back on restores nothing. Each worker runs it, and the statements are
    idempotent, so only the one that finds rows to move says so. The rows
    carry the moment they moved, which a bulk update leaves untouched
    otherwise.
    """
    if models.access_level_error(models.RoomAccessLevel.PUBLIC) is None:
        return

    moved_at = timezone.now()
    rooms = models.Room.objects.filter(
        access_level=models.RoomAccessLevel.PUBLIC
    ).update(access_level=models.RoomAccessLevel.TRUSTED, updated_at=moved_at)
    users = models.User.objects.filter(
        default_room_access_level=models.RoomAccessLevel.PUBLIC
    ).update(
        default_room_access_level=models.RoomAccessLevel.TRUSTED, updated_at=moved_at
    )
    if rooms or users:
        logger.warning(
            "ALLOW_PUBLIC_ROOMS is off: moved %d room(s) and %d user default(s) "
            "from public to trusted",
            rooms,
            users,
        )
