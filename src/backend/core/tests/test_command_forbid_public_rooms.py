"""Test the command that moves public rooms to trusted and clears the defaults."""

from unittest.mock import patch

from django.core.management import call_command

import pytest

from core.factories import RoomFactory, UserFactory
from core.models import RoomAccessLevel
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
)

pytestmark = pytest.mark.django_db


@patch.object(RoomManagement, "list_live_room_names", return_value=set())
def test_forbid_public_rooms_moves_public_rows(_mock_list, settings, capsys):
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


@patch.object(RoomManagement, "update_metadata")
def test_forbid_public_rooms_pushes_the_level_to_live_rooms(
    mock_update_metadata, settings, capsys
):
    """A moved room LiveKit holds gets its new level; a room not live is skipped."""
    live_room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    settings.ALLOW_PUBLIC_ROOMS = False

    with patch.object(
        RoomManagement, "list_live_room_names", return_value={str(live_room.id)}
    ):
        call_command("forbid_public_rooms")

    mock_update_metadata.assert_called_once_with(
        room_name=str(live_room.id),
        metadata={
            "configuration": live_room.configuration,
            "access_level": RoomAccessLevel.TRUSTED,
        },
    )
    assert "Pushed the new level to 1 live meeting(s)." in capsys.readouterr().out


@patch.object(
    RoomManagement,
    "list_live_room_names",
    side_effect=RoomManagementException("Could not list rooms"),
)
def test_forbid_public_rooms_moves_rows_when_livekit_is_down(
    _mock_list, settings, capsys
):
    """A LiveKit that cannot be reached leaves the move done and says so."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    settings.ALLOW_PUBLIC_ROOMS = False

    call_command("forbid_public_rooms")

    room.refresh_from_db()
    assert room.access_level == RoomAccessLevel.TRUSTED
    assert "Could not reach LiveKit" in capsys.readouterr().err
