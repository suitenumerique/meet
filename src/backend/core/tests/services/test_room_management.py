"""Tests for the RoomManagement service."""

import asyncio
import json
import threading
import time
import uuid
from unittest import mock

from django.core.cache import cache
from django.db import connection

import aiohttp
import pytest
from livekit.api import TwirpError

from core.factories import RoomFactory
from core.models import Room, RoomAccessLevel
from core.services import room_management
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)
from core.services.sip_management import SIPException, SIPManagement


async def hang(*args, **kwargs):
    """A media server call that never answers."""
    await asyncio.sleep(60)


def fake_livekit(list_rooms=None, update_room_metadata=None):
    """A LiveKit client whose room service calls are the given coroutines."""
    client = mock.MagicMock()
    client.aclose = mock.AsyncMock()
    client.room.list_rooms = mock.AsyncMock(side_effect=list_rooms)
    client.room.update_room_metadata = mock.AsyncMock(side_effect=update_room_metadata)
    return client


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_delete_room_calls_livekit(mock_create_livekit_client):
    """DeleteRoom is forwarded to the LiveKit API."""
    mock_api = mock.MagicMock()
    mock_api.room.delete_room = mock.AsyncMock()
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    RoomManagement.delete_room("room-abc")

    mock_api.room.delete_room.assert_awaited_once()
    request = mock_api.room.delete_room.await_args.args[0]
    assert request.room == "room-abc"
    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_delete_room_raises_not_found(mock_create_livekit_client):
    """Missing rooms raise RoomNotFoundException."""
    mock_api = mock.MagicMock()
    mock_api.room.delete_room = mock.AsyncMock(
        side_effect=TwirpError("not_found", "room not found", status=404)
    )
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    with pytest.raises(RoomNotFoundException):
        RoomManagement.delete_room("missing-room")

    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_delete_room_raises_management_exception(mock_create_livekit_client):
    """Unexpected Twirp errors raise RoomManagementException."""
    mock_api = mock.MagicMock()
    mock_api.room.delete_room = mock.AsyncMock(
        side_effect=TwirpError("internal", "boom", status=500)
    )
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    with pytest.raises(RoomManagementException):
        RoomManagement.delete_room("room-abc")

    mock_api.aclose.assert_awaited_once()


@pytest.mark.django_db(transaction=True)
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
@mock.patch.object(RoomManagement, "delete_room")
def test_soft_delete_commits_before_closing_livekit_room(mock_delete_room, _):
    """The deletion is committed before the LiveKit room is closed, so the
    room_started webhook of a participant reconnecting right away sees it."""
    room = RoomFactory()

    def assert_deletion_committed(room_name):
        assert connection.in_atomic_block is False
        assert Room.all_objects.get(id=room_name).is_deleted

    mock_delete_room.side_effect = assert_deletion_committed

    RoomManagement.soft_delete(room)

    mock_delete_room.assert_called_once_with(str(room.id))


@pytest.mark.django_db
@pytest.mark.parametrize(
    "error",
    [
        RoomManagementException("Could not delete room"),
        ConnectionError("LiveKit is unreachable"),
    ],
)
@mock.patch.object(SIPManagement, "delete_dispatch_rule", return_value=False)
@mock.patch.object(RoomManagement, "delete_room")
def test_soft_delete_failure_rolls_back_and_can_be_retried(mock_delete_room, _, error):
    """A failed soft delete leaves the room untouched, in database and in memory,
    so it can be retried."""
    room = RoomFactory()
    mock_delete_room.side_effect = error

    with pytest.raises(type(error)):
        RoomManagement.soft_delete(room)

    assert room.deleted_at is None
    assert Room.objects.filter(id=room.id).exists()

    mock_delete_room.side_effect = None
    RoomManagement.soft_delete(room)

    assert mock_delete_room.call_count == 2
    assert room.deleted_at is not None
    assert Room.all_objects.get(id=room.id).deleted_at is not None
    assert Room.objects.filter(id=room.id).exists() is False


@pytest.mark.django_db
@pytest.mark.parametrize("sip_setting", ["ROOM_TELEPHONY_ENABLED", "ROOMKIT_ENABLED"])
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
@mock.patch.object(
    RoomManagement,
    "delete_room",
    side_effect=RoomNotFoundException("Room does not exist"),
)
def test_soft_delete_room_not_live_deletes_dispatch_rule(
    mock_delete_room, mock_delete_dispatch_rule, sip_setting, settings
):
    """A roomkit join creates the dispatch rule before any LiveKit room exists."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    setattr(settings, sip_setting, True)
    room = RoomFactory()

    RoomManagement.soft_delete(room)

    mock_delete_room.assert_called_once_with(str(room.id))
    mock_delete_dispatch_rule.assert_called_once_with(room.id)
    assert Room.all_objects.get(id=room.id).is_deleted


@pytest.mark.django_db
def test_soft_delete_live_room_deletes_dispatch_rule_before_closing_it(settings):
    """The dispatch rule is deleted before the LiveKit room is closed."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    calls = mock.Mock()

    with (
        mock.patch.object(RoomManagement, "delete_room", calls.delete_room),
        mock.patch.object(
            SIPManagement, "delete_dispatch_rule", calls.delete_dispatch_rule
        ),
    ):
        RoomManagement.soft_delete(room)

    assert calls.mock_calls == [
        mock.call.delete_dispatch_rule(room.id),
        mock.call.delete_room(str(room.id)),
    ]


@pytest.mark.django_db
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
@mock.patch.object(RoomManagement, "delete_room")
def test_soft_delete_sip_disabled_skips_dispatch_rule(
    mock_delete_room, mock_delete_dispatch_rule, settings
):
    """Without telephony nor roomkit, no dispatch rule is looked up."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    room = RoomFactory()

    RoomManagement.soft_delete(room)

    mock_delete_room.assert_called_once_with(str(room.id))
    mock_delete_dispatch_rule.assert_not_called()
    assert Room.all_objects.get(id=room.id).is_deleted


@pytest.mark.django_db
@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
@mock.patch.object(
    SIPManagement,
    "delete_dispatch_rule",
    side_effect=SIPException("Could not delete dispatch rules"),
)
@mock.patch.object(RoomManagement, "delete_room")
def test_soft_delete_dispatch_rule_failure_rolls_back(
    mock_delete_room, mock_delete_dispatch_rule, mock_ensure_dispatch_rule, settings
):
    """A dispatch rule that can't be deleted fails the soft delete like a LiveKit
    room that can't be closed: it is rolled back so it can be retried, and the
    LiveKit room is left open."""
    settings.ROOMKIT_ENABLED = True
    room = RoomFactory()

    with pytest.raises(RoomManagementException):
        RoomManagement.soft_delete(room)

    mock_delete_room.assert_not_called()
    mock_delete_dispatch_rule.assert_called_once_with(room.id)
    mock_ensure_dispatch_rule.assert_not_called()
    assert room.deleted_at is None
    assert Room.objects.filter(id=room.id).exists()


@pytest.mark.django_db
@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
@mock.patch.object(SIPManagement, "delete_dispatch_rule", return_value=True)
@mock.patch.object(
    RoomManagement,
    "delete_room",
    side_effect=RoomManagementException("Could not delete room"),
)
def test_soft_delete_room_close_failure_restores_dispatch_rule(
    _, __, mock_ensure_dispatch_rule, settings
):
    """A LiveKit room that can't be closed rolls the deletion back, including
    its dispatch rule, so phone callers can still join the room with its PIN."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()

    with pytest.raises(RoomManagementException, match="Could not delete room"):
        RoomManagement.soft_delete(room)

    mock_ensure_dispatch_rule.assert_called_once_with(room)
    assert room.deleted_at is None
    assert Room.objects.filter(id=room.id).exists()


@pytest.mark.django_db
@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
@mock.patch.object(SIPManagement, "delete_dispatch_rule", return_value=False)
@mock.patch.object(
    RoomManagement,
    "delete_room",
    side_effect=RoomManagementException("Could not delete room"),
)
def test_soft_delete_room_close_failure_without_rule_skips_restore(
    _, __, mock_ensure_dispatch_rule, settings
):
    """A room that had no dispatch rule does not get one on rollback, as nothing
    would ever delete it."""
    settings.ROOMKIT_ENABLED = True
    room = RoomFactory()

    with pytest.raises(RoomManagementException):
        RoomManagement.soft_delete(room)

    mock_ensure_dispatch_rule.assert_not_called()
    assert room.deleted_at is None


@pytest.mark.django_db
@mock.patch.object(
    SIPManagement,
    "ensure_dispatch_rule",
    side_effect=SIPException("Could not create dispatch rule"),
)
@mock.patch.object(SIPManagement, "delete_dispatch_rule", return_value=True)
@mock.patch.object(
    RoomManagement,
    "delete_room",
    side_effect=RoomManagementException("Could not delete room"),
)
def test_soft_delete_restore_failure_raises_original_error(
    _, __, ___, settings, caplog
):
    """A dispatch rule that can't be restored is logged without hiding the error
    that caused the rollback."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()

    with pytest.raises(RoomManagementException, match="Could not delete room"):
        RoomManagement.soft_delete(room)

    assert f"Could not restore dispatch rule for room {room.id}" in caplog.text
    assert room.deleted_at is None
    assert Room.objects.filter(id=room.id).exists()


@mock.patch.object(RoomManagement, "update_metadata")
def test_sync_room_metadata_pushes_configuration_and_access_level(mock_update_metadata):
    """The room's configuration and access level are forwarded to LiveKit."""
    room = RoomFactory.build(
        access_level=RoomAccessLevel.RESTRICTED,
        configuration={"everyone_can_mute": True},
    )

    RoomManagement.sync_room_metadata(room)

    mock_update_metadata.assert_called_once_with(
        room_name=str(room.id),
        metadata={
            "configuration": {"everyone_can_mute": True},
            "access_level": RoomAccessLevel.RESTRICTED,
        },
    )


@pytest.mark.parametrize(
    ("failing", "failure", "lock_kept"),
    [
        ("list_rooms", hang, False),
        ("update_room_metadata", hang, True),
        ("list_rooms", aiohttp.ClientConnectionError(), False),
    ],
)
def test_update_metadata_bounded(failing, failure, lock_kept):
    """A media server that never answers or refuses the connection answers the
    service's own error within one deadline; a cut-off write keeps its lock."""
    room_name = str(uuid.uuid4())
    client = mock.MagicMock()
    client.aclose = mock.AsyncMock()
    for call in ("list_rooms", "update_room_metadata"):
        side_effect = failure if call == failing else None
        setattr(client.room, call, mock.AsyncMock(side_effect=side_effect))
    client.room.list_rooms.return_value = mock.Mock(rooms=[mock.Mock(metadata="{}")])

    with (
        mock.patch.object(
            room_management.utils, "create_livekit_client", return_value=client
        ),
        mock.patch.object(room_management, "MEDIA_SERVER_TIMEOUT_SECONDS", 0.05),
        pytest.raises(RoomManagementException),
    ):
        RoomManagement.update_metadata(room_name, {"key": "value"})

    client.aclose.assert_awaited_once()
    # The write may still land, so the next writer waits for the lock to expire.
    assert cache.lock(f"room-metadata:{room_name}").locked() is lock_kept


def test_update_metadata_concurrent_writers_keep_both_keys():
    """Two writers of one room take turns, so neither drops the other's key."""
    room_name = str(uuid.uuid4())
    state = {"metadata": "{}"}
    both_read = threading.Barrier(2)

    async def list_rooms(request):
        read = state["metadata"]
        # Without a lock both writers read here before either writes.
        try:
            both_read.wait(timeout=0.5)
        except threading.BrokenBarrierError:
            pass
        return mock.Mock(rooms=[mock.Mock(metadata=read)])

    async def update_room_metadata(request):
        state["metadata"] = request.metadata

    client = fake_livekit(list_rooms, update_room_metadata)
    writers = [
        threading.Thread(
            target=RoomManagement.update_metadata,
            args=(room_name, {key: "on"}),
        )
        for key in ("recording_status", "breakout")
    ]
    with mock.patch.object(
        room_management.utils, "create_livekit_client", return_value=client
    ):
        for writer in writers:
            writer.start()
        for writer in writers:
            writer.join()

    assert json.loads(state["metadata"]) == {"recording_status": "on", "breakout": "on"}


def test_update_metadata_lock_busy():
    """A room whose metadata another writer holds fails without calling LiveKit."""
    room_name = str(uuid.uuid4())
    client = fake_livekit()
    held = cache.lock(f"room-metadata:{room_name}", timeout=5)
    assert held.acquire(blocking=False)

    try:
        with (
            mock.patch.object(
                room_management.utils, "create_livekit_client", return_value=client
            ),
            mock.patch.object(room_management, "METADATA_LOCK_TIMEOUT_SECONDS", 0.05),
            mock.patch.object(room_management, "MEDIA_SERVER_TIMEOUT_SECONDS", 0.05),
            pytest.raises(RoomManagementException),
        ):
            RoomManagement.update_metadata(room_name, {"key": "value"})
    finally:
        held.release()

    client.room.list_rooms.assert_not_awaited()


def test_update_metadata_waits_for_a_slow_writer():
    """A write lands after another held the lock longer than one media server call."""
    room_name = str(uuid.uuid4())

    async def list_rooms(request):
        return mock.Mock(rooms=[mock.Mock(metadata="{}")])

    client = fake_livekit(list_rooms)
    acquired = threading.Event()

    def slow_writer():
        held = cache.lock(f"room-metadata:{room_name}", timeout=2)
        held.acquire()
        acquired.set()
        time.sleep(0.5)
        held.release()

    holder = threading.Thread(target=slow_writer)
    with (
        mock.patch.object(
            room_management.utils, "create_livekit_client", return_value=client
        ),
        mock.patch.object(room_management, "MEDIA_SERVER_TIMEOUT_SECONDS", 0.1),
        mock.patch.object(room_management, "METADATA_LOCK_TIMEOUT_SECONDS", 2),
    ):
        holder.start()
        acquired.wait()
        try:
            RoomManagement.update_metadata(room_name, {"key": "value"})
        finally:
            holder.join()

    client.room.update_room_metadata.assert_awaited_once()
