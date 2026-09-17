"""Tests for the purge_inactive_rooms management command."""

import logging
from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.utils import timezone

import pytest

from core import factories, models

pytestmark = pytest.mark.django_db

COMMAND_MODULE = "core.management.commands.purge_inactive_rooms"

BEFORE_PERIOD = timedelta(days=366)
WITHIN_PERIOD = timedelta(days=364)


@pytest.fixture(name="purge_enabled", autouse=True)
def fixture_purge_enabled(settings):
    """Enable the purge of the rooms inactive for a year."""
    settings.ROOM_INACTIVITY_DELETION_DAYS = 365
    settings.RECORDING_EXPIRATION_DAYS = None


def create_at(date, factory, **kwargs):
    """Build an object with the factory as if it was created at the given date."""
    with mock.patch("django.utils.timezone.now", return_value=date):
        return factory(**kwargs)


def call_purge(*args):
    """Run the purge command and return what it wrote on stdout."""
    out = StringIO()
    call_command("purge_inactive_rooms", *args, stdout=out)
    return out.getvalue()


def room_exists(room):
    """Tell whether the room is still in database."""
    return models.Room.objects.filter(pk=room.pk).exists()


def test_purge_inactive_rooms_disabled(settings):
    """Should delete nothing when no inactivity period is configured."""
    settings.ROOM_INACTIVITY_DELETION_DAYS = None
    room = create_at(timezone.now() - BEFORE_PERIOD, factories.RoomFactory)

    assert "disabled" in call_purge()

    assert room_exists(room)


def test_purge_inactive_rooms_started_before_period(caplog):
    """Should delete a room that was last started before the inactivity period."""
    now = timezone.now()
    room = create_at(
        now - timedelta(days=800),
        factories.RoomFactory,
        last_started_at=now - BEFORE_PERIOD,
    )

    with caplog.at_level(logging.INFO, logger=COMMAND_MODULE):
        output = call_purge()

    assert output == "Purged 1 inactive room(s).\n"
    assert not room_exists(room)
    assert f"Purging inactive room {room.pk} ({room.slug})" in caplog.text


def test_purge_inactive_rooms_never_started_created_before_period():
    """Should delete a room that was never started and created before the period."""
    room = create_at(timezone.now() - BEFORE_PERIOD, factories.RoomFactory)

    call_purge()

    assert not room_exists(room)


def test_purge_inactive_rooms_started_within_period():
    """Should keep a room created long ago that was started within the period."""
    now = timezone.now()
    room = create_at(
        now - timedelta(days=800),
        factories.RoomFactory,
        last_started_at=now - WITHIN_PERIOD,
    )

    assert call_purge() == "No inactive room to purge.\n"

    assert room_exists(room)


def test_purge_inactive_rooms_never_started_created_within_period():
    """Should keep a room that was never started but created within the period."""
    room = create_at(timezone.now() - WITHIN_PERIOD, factories.RoomFactory)

    assert call_purge() == "No inactive room to purge.\n"

    assert room_exists(room)


def test_purge_inactive_rooms_recording_without_expiration():
    """Should keep a room holding a recording when recordings never expire."""
    long_ago = timezone.now() - BEFORE_PERIOD
    room = create_at(long_ago, factories.RoomFactory)
    create_at(
        long_ago,
        factories.RecordingFactory,
        room=room,
        status=models.RecordingStatusChoices.SAVED,
    )

    call_purge()

    assert room_exists(room)


def test_purge_inactive_rooms_recording_not_expired(settings):
    """Should keep a room holding a recording that has not expired yet."""
    settings.RECORDING_EXPIRATION_DAYS = 400
    long_ago = timezone.now() - BEFORE_PERIOD
    room = create_at(long_ago, factories.RoomFactory)
    create_at(
        long_ago,
        factories.RecordingFactory,
        room=room,
        status=models.RecordingStatusChoices.SAVED,
    )

    call_purge()

    assert room_exists(room)


def test_purge_inactive_rooms_recording_expired(settings):
    """Should delete a room along with its recordings when they all have expired."""
    settings.RECORDING_EXPIRATION_DAYS = 30
    long_ago = timezone.now() - BEFORE_PERIOD
    room = create_at(long_ago, factories.RoomFactory)
    recording = create_at(
        long_ago,
        factories.RecordingFactory,
        room=room,
        status=models.RecordingStatusChoices.SAVED,
    )

    call_purge()

    assert not room_exists(room)
    assert not models.Recording.objects.filter(pk=recording.pk).exists()


@pytest.mark.parametrize(
    "status",
    [
        models.RecordingStatusChoices.ABORTED,
        models.RecordingStatusChoices.FAILED_TO_START,
        models.RecordingStatusChoices.FAILED_TO_STOP,
    ],
)
def test_purge_inactive_rooms_recording_unsuccessful(status):
    """Should delete a room whose only recordings are unsuccessful."""
    long_ago = timezone.now() - BEFORE_PERIOD
    room = create_at(long_ago, factories.RoomFactory)
    create_at(long_ago, factories.RecordingFactory, room=room, status=status)

    call_purge()

    assert not room_exists(room)


def test_purge_inactive_rooms_recording_saved_among_unsuccessful():
    """Should keep a room holding a saved recording next to an unsuccessful one."""
    long_ago = timezone.now() - BEFORE_PERIOD
    room = create_at(long_ago, factories.RoomFactory)
    create_at(
        long_ago,
        factories.RecordingFactory,
        room=room,
        status=models.RecordingStatusChoices.FAILED_TO_START,
    )
    create_at(
        long_ago,
        factories.RecordingFactory,
        room=room,
        status=models.RecordingStatusChoices.SAVED,
    )

    call_purge()

    assert room_exists(room)


def test_purge_inactive_rooms_deletes_accesses_and_resource():
    """Should delete the last owner access and the resource of a purged room."""
    room = create_at(timezone.now() - BEFORE_PERIOD, factories.RoomFactory)
    access = factories.UserResourceAccessFactory(
        resource=room, role=models.RoleChoices.OWNER
    )

    call_purge()

    assert not room_exists(room)
    assert not models.Resource.objects.filter(pk=room.pk).exists()
    assert not models.ResourceAccess.objects.filter(pk=access.pk).exists()
    assert models.User.objects.filter(pk=access.user.pk).exists()


def test_purge_inactive_rooms_dry_run():
    """Should list the inactive rooms by name without deleting them on a dry run."""
    long_ago = timezone.now() - BEFORE_PERIOD
    rooms = [
        create_at(long_ago, factories.RoomFactory, name=name)
        for name in ("Alpha room", "Beta room")
    ]
    factories.RoomFactory(name="Recent room")

    assert call_purge("--dry-run") == (
        "[dry-run] 2 inactive room(s) would be purged:\n- Alpha room\n- Beta room\n"
    )

    assert all(room_exists(room) for room in rooms)


def test_purge_inactive_rooms_several_chunks():
    """Should delete every inactive room when they span several chunks."""
    long_ago = timezone.now() - BEFORE_PERIOD
    rooms = [create_at(long_ago, factories.RoomFactory) for _ in range(5)]

    with mock.patch(f"{COMMAND_MODULE}.CHUNK_SIZE", 2):
        output = call_purge()

    assert output == "Purged 5 inactive room(s).\n"
    assert not any(room_exists(room) for room in rooms)
