"""Row locks guarding the API write paths."""

import contextlib

from django.db import transaction

from core import models
from core.api.exceptions import ensure_room_not_deleted


@contextlib.contextmanager
def room_locked_for_update(room):
    """Lock a room's row for the duration of a write."""
    with transaction.atomic():
        locked_room = models.Room.all_objects.select_for_update().get(pk=room.pk)
        ensure_room_not_deleted(locked_room)
        yield locked_room
