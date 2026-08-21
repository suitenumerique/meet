"""Tests for the RoomManagement service."""

import asyncio
import time
from unittest import mock

from django.test.utils import override_settings

import aiohttp
import pytest
from livekit.api import TwirpError
from livekit.protocol.models import ParticipantInfo, ParticipantPermission
from livekit.protocol.room import ListParticipantsResponse

from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)


def livekit_client(mock_create_livekit_client, **calls):
    """Wire a mocked LiveKit client, one keyword per room method under test.

    An exception becomes that call's side effect, anything else its return
    value. Every test needs the same four lines otherwise.
    """
    mock_api = mock.MagicMock()

    for name, outcome in calls.items():
        answer = (
            {"side_effect": outcome}
            if isinstance(outcome, Exception)
            else {"return_value": outcome}
        )
        setattr(mock_api.room, name, mock.AsyncMock(**answer))

    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    return mock_api


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_delete_room_calls_livekit(mock_create_livekit_client):
    """DeleteRoom is forwarded to the LiveKit API."""
    mock_api = livekit_client(mock_create_livekit_client, delete_room=None)

    RoomManagement().delete_room("room-abc")

    mock_api.room.delete_room.assert_awaited_once()
    request = mock_api.room.delete_room.await_args.args[0]
    assert request.room == "room-abc"
    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_delete_room_raises_not_found(mock_create_livekit_client):
    """Missing rooms raise RoomNotFoundException."""
    mock_api = livekit_client(
        mock_create_livekit_client,
        delete_room=TwirpError("not_found", "room not found", status=404),
    )

    with pytest.raises(RoomNotFoundException):
        RoomManagement().delete_room("missing-room")

    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_delete_room_raises_management_exception(mock_create_livekit_client):
    """Unexpected Twirp errors raise RoomManagementException."""
    mock_api = livekit_client(
        mock_create_livekit_client,
        delete_room=TwirpError("internal", "boom", status=500),
    )

    with pytest.raises(RoomManagementException):
        RoomManagement().delete_room("room-abc")

    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_get_participants_counts_and_names_them(mock_create_livekit_client):
    """Everyone is counted, and the ones who gave a name are named."""
    mock_api = livekit_client(
        mock_create_livekit_client,
        list_participants=ListParticipantsResponse(
            participants=[
                ParticipantInfo(name="Zora"),
                ParticipantInfo(name="Neel"),
                ParticipantInfo(name=""),
            ]
        ),
    )

    assert RoomManagement().get_participants("room-abc") == {
        "count": 3,
        "names": ["Zora", "Neel"],
    }

    request = mock_api.room.list_participants.await_args.args[0]
    assert request.room == "room-abc"
    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_get_participants_names_everyone_who_gave_a_name(mock_create_livekit_client):
    """A big meeting is answered whole: the caller decides how many to show."""
    livekit_client(
        mock_create_livekit_client,
        list_participants=ListParticipantsResponse(
            participants=[ParticipantInfo(name=f"P{i:d}") for i in range(9)]
        ),
    )

    answer = RoomManagement().get_participants("room-abc")

    assert answer["count"] == 9
    assert answer["names"] == [f"P{i:d}" for i in range(9)]


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_get_participants_leaves_out_machines(mock_create_livekit_client):
    """A recorder and an agent are in the room and are not people."""
    livekit_client(
        mock_create_livekit_client,
        list_participants=ListParticipantsResponse(
            participants=[
                ParticipantInfo(name="Zora"),
                ParticipantInfo(name="egress", kind=ParticipantInfo.Kind.EGRESS),
                ParticipantInfo(name="agent", kind=ParticipantInfo.Kind.AGENT),
                ParticipantInfo(
                    name="recorder",
                    permission=ParticipantPermission(recorder=True),
                ),
                ParticipantInfo(
                    name="assistant",
                    permission=ParticipantPermission(agent=True),
                ),
                ParticipantInfo(name="phone", kind=ParticipantInfo.Kind.SIP),
            ]
        ),
    )

    assert RoomManagement().get_participants("room-abc") == {
        "count": 2,
        "names": ["Zora", "phone"],
    }


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_get_participants_of_a_room_livekit_does_not_know(mock_create_livekit_client):
    """A room LiveKit has never created has nobody in it."""
    mock_api = livekit_client(
        mock_create_livekit_client,
        list_participants=TwirpError("not_found", "room not found", status=404),
    )

    assert RoomManagement().get_participants("room-abc") == {"count": 0, "names": []}

    mock_api.aclose.assert_awaited_once()


@pytest.mark.parametrize(
    "error",
    [
        TwirpError("internal", "boom", status=500),
        aiohttp.ClientConnectorError(mock.Mock(), OSError("connection refused")),
        TimeoutError(),
    ],
)
@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_get_participants_raises_management_exception(
    mock_create_livekit_client, error
):
    """A refusal and an unreachable server both fail the same way."""
    mock_api = livekit_client(mock_create_livekit_client, list_participants=error)
    service = RoomManagement()

    with pytest.raises(RoomManagementException):
        service.get_participants("room-abc")

    mock_api.aclose.assert_awaited_once()


@override_settings(ROOM_PARTICIPANTS_TIMEOUT_SECONDS=1)
@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_get_participants_gives_up_on_a_silent_livekit(mock_create_livekit_client):
    """A LiveKit that takes the connection and never answers is not waited on.

    Timing it rather than asserting a keyword, because the SDK cannot be given a
    timeout at all: it passes timeout=None to aiohttp for every call, which
    overrides the session's own and leaves the request unbounded.
    """

    async def never_answers(*args, **kwargs):
        await asyncio.sleep(30)

    mock_api = livekit_client(mock_create_livekit_client, list_participants=None)
    mock_api.room.list_participants = mock.AsyncMock(side_effect=never_answers)
    service = RoomManagement()

    started = time.monotonic()
    with pytest.raises(RoomManagementException):
        service.get_participants("room-abc")

    assert time.monotonic() - started < 10
    mock_api.aclose.assert_awaited_once()
