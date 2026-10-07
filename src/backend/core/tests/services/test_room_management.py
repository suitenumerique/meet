"""Tests for the RoomManagement service."""

import asyncio
import json
import threading
import time
import uuid
from unittest import mock

from django.core.cache import cache

import aiohttp
import pytest
from livekit.api import TwirpError

from core.factories import RoomFactory
from core.models import RoomAccessLevel
from core.services import room_management
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)


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
    ("hanging", "lock_kept"), [("list_rooms", False), ("update_room_metadata", True)]
)
def test_update_metadata_bounded(hanging, lock_kept):
    """A media server that never answers costs one deadline; a cut-off write keeps its lock."""
    room_name = str(uuid.uuid4())
    client = mock.MagicMock()
    client.aclose = mock.AsyncMock()
    for call in ("list_rooms", "update_room_metadata"):
        side_effect = hang if call == hanging else None
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


def test_update_metadata_unreachable_raises_management_exception():
    """A media server refusing the connection answers the service's own error."""
    room_name = str(uuid.uuid4())
    client = fake_livekit(list_rooms=aiohttp.ClientConnectionError())

    with (
        mock.patch.object(
            room_management.utils, "create_livekit_client", return_value=client
        ),
        pytest.raises(RoomManagementException),
    ):
        RoomManagement.update_metadata(room_name, {"key": "value"})

    client.aclose.assert_awaited_once()
    assert not cache.lock(f"room-metadata:{room_name}").locked()


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
