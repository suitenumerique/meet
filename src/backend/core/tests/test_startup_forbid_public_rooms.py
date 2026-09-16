"""Test the sweep that moves public rooms to trusted as the web application starts."""

import importlib
import logging
from unittest import mock

import pytest

from core import startup
from core.factories import RoomFactory, UserFactory
from core.models import RoomAccessLevel

pytestmark = pytest.mark.django_db


def test_startup_forbid_public_rooms_moves_public_rows(settings, caplog):
    """Where public rooms are forbidden, public rooms and defaults move, and it says so."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    user = UserFactory(default_room_access_level=RoomAccessLevel.PUBLIC)
    settings.ALLOW_PUBLIC_ROOMS = False

    with caplog.at_level(logging.WARNING, logger="core.startup"):
        startup.forbid_public_rooms()

    room.refresh_from_db()
    user.refresh_from_db()
    assert room.access_level == RoomAccessLevel.TRUSTED
    assert user.default_room_access_level == RoomAccessLevel.TRUSTED
    assert "moved 1 room(s) and 1 user default(s)" in caplog.text


@pytest.mark.parametrize(
    "allow_public_rooms,access_level",
    [(True, RoomAccessLevel.PUBLIC), (False, RoomAccessLevel.RESTRICTED)],
)
def test_startup_forbid_public_rooms_touches_nothing_otherwise(
    settings, caplog, allow_public_rooms, access_level
):
    """An instance allowing public rooms, or holding none, is left alone and silent."""
    room = RoomFactory(access_level=access_level)
    user = UserFactory(default_room_access_level=access_level)
    settings.ALLOW_PUBLIC_ROOMS = allow_public_rooms

    with caplog.at_level(logging.WARNING, logger="core.startup"):
        startup.forbid_public_rooms()

    room.refresh_from_db()
    user.refresh_from_db()
    assert room.access_level == access_level
    assert user.default_room_access_level == access_level
    assert caplog.text == ""


def test_startup_forbid_public_rooms_runs_as_the_application_starts():
    """The WSGI entry point runs the sweep once, as the application is built."""
    wsgi = importlib.import_module("meet.wsgi")

    with mock.patch.object(startup, "forbid_public_rooms") as sweep:
        importlib.reload(wsgi)

    sweep.assert_called_once_with()
