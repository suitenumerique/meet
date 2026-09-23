"""Test the command that moves public rooms to trusted and clears the defaults."""

from django.core.management import call_command

import pytest

from core.factories import RoomFactory, UserFactory
from core.models import RoomAccessLevel

pytestmark = pytest.mark.django_db


def test_forbid_public_rooms_moves_public_rows(settings, capsys):
    """Where public rooms are forbidden, the command moves them and reports the counts."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    user = UserFactory(default_room_access_level=RoomAccessLevel.PUBLIC)
    room_updated_at, user_updated_at = room.updated_at, user.updated_at
    settings.ALLOW_PUBLIC_ROOMS = False

    call_command("forbid_public_rooms")

    room.refresh_from_db()
    user.refresh_from_db()
    assert room.access_level == RoomAccessLevel.TRUSTED
    assert user.default_room_access_level is None
    assert room.updated_at > room_updated_at
    assert user.updated_at > user_updated_at
    assert "Moved 1 room(s) and cleared 1 user default(s)" in capsys.readouterr().out


def test_forbid_public_rooms_dry_run_touches_nothing(settings, capsys):
    """The dry run reports what would move and changes no row."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    user = UserFactory(default_room_access_level=RoomAccessLevel.PUBLIC)
    room_updated_at, user_updated_at = room.updated_at, user.updated_at
    settings.ALLOW_PUBLIC_ROOMS = False

    call_command("forbid_public_rooms", "--dry-run")

    room.refresh_from_db()
    user.refresh_from_db()
    assert room.access_level == RoomAccessLevel.PUBLIC
    assert user.default_room_access_level == RoomAccessLevel.PUBLIC
    assert (room.updated_at, user.updated_at) == (room_updated_at, user_updated_at)
    out = capsys.readouterr().out
    assert "Would move 1 room(s) and clear 1 user default(s)" in out
    assert f"room {room.slug}" in out
    assert f"default cleared for {user}" in out
    assert "Nothing changed." in out


@pytest.mark.parametrize(
    "allow_public_rooms,access_level",
    [(True, RoomAccessLevel.PUBLIC), (False, RoomAccessLevel.RESTRICTED)],
)
def test_forbid_public_rooms_touches_nothing_otherwise(
    settings, allow_public_rooms, access_level
):
    """An instance allowing public rooms, or holding none, is left alone."""
    room = RoomFactory(access_level=access_level)
    user = UserFactory(default_room_access_level=access_level)
    room_updated_at, user_updated_at = room.updated_at, user.updated_at
    settings.ALLOW_PUBLIC_ROOMS = allow_public_rooms

    call_command("forbid_public_rooms")

    room.refresh_from_db()
    user.refresh_from_db()
    assert room.access_level == access_level
    assert user.default_room_access_level == access_level
    assert (room.updated_at, user.updated_at) == (room_updated_at, user_updated_at)
