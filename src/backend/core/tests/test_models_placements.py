"""
Unit tests for the Placement model
"""

from django.core.exceptions import ValidationError
from django.db import connection

import pytest

from core.factories import RoomFactory
from core.models import Placement

pytestmark = pytest.mark.django_db


def test_models_placements_str():
    """The str representation should name the LiveKit room and its cluster."""
    placement = Placement.objects.create(room_name="my-room", cluster="paris")
    assert str(placement) == "my-room on paris"


def test_models_placements_defaults():
    """A new placement has no room, no SID, no relocation, no absence and epoch 0."""
    placement = Placement.objects.create(room_name="my-room", cluster="paris")

    placement.refresh_from_db()
    assert placement.room is None
    assert placement.sid == ""
    assert placement.epoch == 0
    assert placement.previous_cluster == ""
    assert placement.relocated_at is None
    assert placement.absent_since is None


def test_models_placements_room_name_unique():
    """A LiveKit room has a single placement, also when writes skip validation."""
    Placement.objects.create(room_name="my-room", cluster="paris")

    with pytest.raises(ValidationError) as excinfo:
        Placement.objects.create(room_name="my-room", cluster="lyon")

    assert "Placement with this LiveKit room name already exists." in str(excinfo.value)

    Placement.objects.bulk_create(
        [Placement(room_name="my-room", cluster="lyon")], ignore_conflicts=True
    )

    assert Placement.objects.get().cluster == "paris"


def test_models_placements_room_deleted():
    """A placement outlives its room's record, and then points to no room."""
    room = RoomFactory()
    room_name = str(room.pk)
    placement = Placement.objects.create(
        room_name=room_name, room=room, cluster="paris"
    )

    room.delete()

    placement.refresh_from_db()
    assert placement.room is None
    assert placement.room_name == room_name
    assert placement.cluster == "paris"


def test_models_placements_room_deleted_without_the_collector():
    """The database unsets the room of a placement when a deletion bypasses Django."""
    room = RoomFactory()
    placement = Placement.objects.create(
        room_name=str(room.pk), room=room, cluster="paris"
    )

    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM meet_room WHERE resource_id = %s", [room.pk])
        cursor.execute("DELETE FROM meet_resource WHERE id = %s", [room.pk])

    placement.refresh_from_db()
    assert placement.room is None
    assert placement.cluster == "paris"
