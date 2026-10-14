"""Fixtures shared by the breakout tests."""

import json
from unittest import mock

import pytest

from core import utils
from core.services import room_management


def live_room(metadata):
    """What the media server lists for a live meeting holding this metadata."""
    return mock.Mock(rooms=[mock.Mock(metadata=metadata)])


@pytest.fixture
def livekit():
    """A media server client whose meeting is live and keeps what is written to it."""
    client = mock.MagicMock()
    client.aclose = mock.AsyncMock()

    async def store(request):
        client.room.list_rooms.return_value = live_room(request.metadata)

    client.room.update_room_metadata = mock.AsyncMock(side_effect=store)
    client.room.list_rooms = mock.AsyncMock(
        return_value=live_room(json.dumps({"access_level": "public"}))
    )
    client.egress.list_egress = mock.AsyncMock(return_value=mock.Mock(items=[]))
    # A write that timed out leaves its lock to expire; tests wait a moment, not 15 s.
    with (
        mock.patch.object(utils, "create_livekit_client", return_value=client),
        mock.patch.object(room_management, "METADATA_LOCK_TIMEOUT_SECONDS", 0.2),
    ):
        yield client
