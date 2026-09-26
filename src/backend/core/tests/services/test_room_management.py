"""Tests for the RoomManagement service."""

# pylint: disable=redefined-outer-name

from unittest import mock

from django.core.cache import cache
from django.test.utils import override_settings

import aiohttp
import pytest
from livekit.api import TwirpError
from livekit.protocol.models import ParticipantInfo, ParticipantPermission
from livekit.protocol.room import ListParticipantsResponse

from core.factories import RoomFactory
from core.models import RoomAccessLevel
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)


@pytest.fixture
def livekit():
    """A mocked LiveKit client, reporting nobody in every room."""
    with mock.patch(
        "core.services.room_management.utils.create_livekit_client"
    ) as create:
        client = mock.AsyncMock()
        client.room.list_participants.return_value = ListParticipantsResponse()
        create.return_value = client
        yield client


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


@pytest.mark.usefixtures("local_cache")
def test_get_participants_counts_and_names_them(livekit):
    """Everyone is counted, and the ones who gave a name are named."""
    livekit.room.list_participants.return_value = ListParticipantsResponse(
        participants=[
            ParticipantInfo(name="Zora"),
            ParticipantInfo(name="Neel"),
            ParticipantInfo(name=""),
        ]
    )

    assert RoomManagement.get_participants("room-abc") == {
        "count": 3,
        "names": ["Zora", "Neel"],
    }

    request = livekit.room.list_participants.await_args.args[0]
    assert request.room == "room-abc"
    livekit.aclose.assert_awaited_once()


@pytest.mark.usefixtures("local_cache")
def test_get_participants_leaves_out_machines(livekit):
    """A recorder and an agent are in the room and are not people."""
    livekit.room.list_participants.return_value = ListParticipantsResponse(
        participants=[
            ParticipantInfo(name="Zora"),
            ParticipantInfo(name="egress", kind=ParticipantInfo.Kind.EGRESS),
            ParticipantInfo(name="agent", kind=ParticipantInfo.Kind.AGENT),
            ParticipantInfo(
                name="recorder", permission=ParticipantPermission(recorder=True)
            ),
            ParticipantInfo(
                name="assistant", permission=ParticipantPermission(agent=True)
            ),
            ParticipantInfo(name="phone", kind=ParticipantInfo.Kind.SIP),
        ]
    )

    assert RoomManagement.get_participants("room-abc") == {
        "count": 2,
        "names": ["Zora", "phone"],
    }


@pytest.mark.usefixtures("local_cache")
def test_get_participants_of_a_room_livekit_does_not_know(livekit):
    """A room LiveKit has never created has nobody in it."""
    livekit.room.list_participants.side_effect = TwirpError(
        "not_found", "room not found", status=404
    )

    assert RoomManagement.get_participants("room-abc") == {"count": 0, "names": []}

    livekit.aclose.assert_awaited_once()


@pytest.mark.usefixtures("local_cache")
@pytest.mark.parametrize(
    "error",
    [
        TwirpError("internal", "boom", status=500),
        aiohttp.ClientConnectorError(mock.Mock(), OSError("connection refused")),
    ],
)
def test_get_participants_raises_management_exception(livekit, error):
    """A refusal and an unreachable server both fail the same way."""
    livekit.room.list_participants.side_effect = error

    with pytest.raises(RoomManagementException):
        RoomManagement.get_participants("room-abc")

    livekit.aclose.assert_awaited_once()


@pytest.mark.usefixtures("local_cache")
def test_get_participants_is_read_once_for_everyone_waiting(livekit):
    """The join screen polls, so the answer is cached rather than asked twice."""
    RoomManagement.get_participants("room-abc")
    RoomManagement.get_participants("room-abc")

    assert livekit.room.list_participants.await_count == 1


@pytest.mark.usefixtures("local_cache")
def test_get_participants_of_two_rooms_are_cached_apart(livekit):
    """One meeting's answer is never served for another."""
    RoomManagement.get_participants("room-abc")
    RoomManagement.get_participants("room-def")

    assert livekit.room.list_participants.await_count == 2


@pytest.mark.usefixtures("local_cache")
def test_get_participants_one_caller_refreshes_an_expired_answer(livekit):
    """The lock expires once, so the callers behind it read the last answer."""
    RoomManagement.get_participants("room-abc")
    cache.delete("room_participants_room-abc_lock")

    for _ in range(4):
        RoomManagement.get_participants("room-abc")

    assert livekit.room.list_participants.await_count == 2


@pytest.mark.usefixtures("local_cache")
@override_settings(ROOM_PARTICIPANTS_CACHE_SECONDS=0)
def test_get_participants_cache_can_be_turned_off(livekit):
    """A zero hold sends every call through to LiveKit."""
    RoomManagement.get_participants("room-abc")
    RoomManagement.get_participants("room-abc")

    assert livekit.room.list_participants.await_count == 2


@pytest.mark.usefixtures("local_cache")
def test_get_participants_caches_a_failure(livekit):
    """A LiveKit that failed is not asked again by everyone else waiting."""
    livekit.room.list_participants.side_effect = TwirpError(
        "internal", "boom", status=500
    )

    for _ in range(2):
        with pytest.raises(RoomManagementException):
            RoomManagement.get_participants("room-abc")

    assert livekit.room.list_participants.await_count == 1


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
