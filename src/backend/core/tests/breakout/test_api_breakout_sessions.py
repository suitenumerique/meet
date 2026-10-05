"""
Test breakout sessions API endpoints in the Meet core app.
"""

# pylint: disable=W0621,W0613
import asyncio
import json
import time
from unittest import mock

from django.db import IntegrityError

import aiohttp
import pytest
from rest_framework.test import APIClient

from core import models
from core.factories import (
    RecordingFactory,
    RoomFactory,
    UserFactory,
    UserResourceAccessFactory,
)
from core.services import room_management

pytestmark = pytest.mark.django_db

ACTIVE = models.BreakoutSessionStatusChoices.ACTIVE
CLOSED = models.BreakoutSessionStatusChoices.CLOSED


def logged_in(room, role=None):
    """A new user, holding role in the meeting if given, and a client logged in as them."""
    user = UserFactory()
    if role:
        UserResourceAccessFactory(resource=room, user=user, role=role)
    client = APIClient()
    client.force_login(user)
    return user, client


@pytest.fixture
def owner_room():
    """A meeting and an API client logged in as its owner."""
    room = RoomFactory()
    _owner, client = logged_in(room, "owner")
    return room, client


def url(room, suffix=""):
    """The breakout sessions URL of a meeting."""
    return f"/api/v1.0/rooms/{room.id!s}/breakout-sessions/{suffix}"


def payload(*room_participants):
    """A split with one room per list of identities."""
    return {
        "rooms": [
            {
                "name": f"Room {index + 1}",
                "participants": [
                    {"identity": identity, "name": identity.title()}
                    for identity in identities
                ],
            }
            for index, identities in enumerate(room_participants)
        ]
    }


def make_session(room, *room_participants):
    """Rows of an active session, with no metadata written."""
    session = models.BreakoutSession.objects.create(room=room)
    for index, identities in enumerate(room_participants):
        breakout_room = models.BreakoutRoom.objects.create(
            session=session, name=f"Room {index + 1}", position=index
        )
        for identity in identities:
            models.BreakoutAssignment.objects.create(
                session=session, breakout_room=breakout_room, identity=identity
            )
    return session


def written_metadata(livekit):
    """The metadata of the last write to the meeting."""
    request = livekit.room.update_room_metadata.await_args.args[0]
    return json.loads(request.metadata)


# Create


def test_api_breakout_sessions_create_owner(livekit, owner_room):
    """The owner writes the rows, then tells every browser who is in which room."""
    room, client = owner_room

    response = client.post(url(room), payload(["alice"], ["bob", "carol"]), "json")

    assert response.status_code == 201
    session = models.BreakoutSession.objects.get()
    assert session.status == ACTIVE
    assert response.json()["rooms"] == [
        {
            "id": str(breakout_room.id),
            "name": breakout_room.name,
            "participants": [
                {"identity": a.identity, "name": a.name}
                for a in breakout_room.assignments.all()
            ],
        }
        for breakout_room in session.rooms.all()
    ]
    assert written_metadata(livekit) == {
        "access_level": "public",
        "breakout": {
            "session_id": str(session.id),
            "rooms": ["Room 1", "Room 2"],
            "assignments": {"alice": 0, "bob": 1, "carol": 1},
        },
    }


@pytest.mark.parametrize("role", [None, "member"])
def test_api_breakout_sessions_create_not_manager(livekit, role):
    """Only the meeting's owner or administrators open a session."""
    room = RoomFactory()
    client = logged_in(room, role)[1] if role else APIClient()

    response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert response.status_code == (401 if role is None else 403)
    assert not models.BreakoutSession.objects.exists()
    livekit.room.update_room_metadata.assert_not_awaited()


@pytest.mark.parametrize(
    "rooms",
    [
        [["alice"]],
        [[f"p{index}"] for index in range(21)],
        [["alice"], ["alice"]],
    ],
)
def test_api_breakout_sessions_create_invalid(livekit, owner_room, rooms):
    """Two to twenty rooms, and one room per participant."""
    room, client = owner_room

    response = client.post(url(room), payload(*rooms), "json")

    assert response.status_code == 400
    livekit.room.update_room_metadata.assert_not_awaited()


def test_api_breakout_sessions_create_twenty_rooms(livekit, owner_room):
    """Twenty rooms, the ceiling, open."""
    room, client = owner_room

    response = client.post(
        url(room), payload(*([f"p{index}"] for index in range(20))), "json"
    )

    assert response.status_code == 201
    assert models.BreakoutRoom.objects.count() == 20


def test_api_breakout_sessions_create_long_name(livekit, owner_room):
    """A name longer than the column, which joining accepts, is cut, not refused."""
    room, client = owner_room
    split = payload(["alice"], ["bob"])
    split["rooms"][0]["participants"][0]["name"] = "x" * 300

    response = client.post(url(room), split, "json")

    assert response.status_code == 201
    assert models.BreakoutAssignment.objects.get(identity="alice").name == "x" * 255


def test_api_breakout_sessions_create_while_active(livekit, owner_room):
    """An active session holds the meeting: a new one answers 409."""
    room, client = owner_room
    make_session(room, ["alice"])

    response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert response.status_code == 409
    assert models.BreakoutSession.objects.count() == 1
    livekit.room.update_room_metadata.assert_not_awaited()


@pytest.mark.parametrize(
    "status",
    [models.RecordingStatusChoices.INITIATED, models.RecordingStatusChoices.ACTIVE],
)
def test_api_breakout_sessions_create_while_recording(livekit, owner_room, status):
    """A recording would capture every room, so a split waits for it to stop."""
    room, client = owner_room
    RecordingFactory(room=room, status=status)

    response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert response.status_code == 409
    assert not models.BreakoutSession.objects.exists()
    livekit.room.update_room_metadata.assert_not_awaited()


def test_api_breakout_sessions_create_while_a_recorder_runs(livekit, owner_room):
    """A recorder the media server still runs refuses the split, whatever the rows say."""
    room, client = owner_room
    RecordingFactory(room=room, status=models.RecordingStatusChoices.FAILED_TO_STOP)
    livekit.egress.list_egress.return_value = mock.Mock(items=[mock.Mock()])

    response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert response.status_code == 409
    request = livekit.egress.list_egress.await_args.args[0]
    assert (request.room_name, request.active) == (str(room.id), True)
    assert not models.BreakoutSession.objects.exists()
    livekit.room.update_room_metadata.assert_not_awaited()


@pytest.mark.parametrize(
    "failure", [TimeoutError, aiohttp.ClientConnectionError("refused")]
)
def test_api_breakout_sessions_create_recorders_unknown(livekit, owner_room, failure):
    """A media server that cannot say whether it records refuses the split."""
    room, client = owner_room
    livekit.egress.list_egress.side_effect = failure

    response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert response.status_code == 503
    assert not models.BreakoutSession.objects.exists()
    livekit.room.update_room_metadata.assert_not_awaited()


@pytest.mark.parametrize(
    "status",
    [
        models.RecordingStatusChoices.STOPPED,
        models.RecordingStatusChoices.FAILED_TO_STOP,
    ],
)
def test_api_breakout_sessions_create_after_recording(livekit, owner_room, status):
    """A recording whose recorder has ended no longer holds the meeting."""
    room, client = owner_room
    RecordingFactory(room=room, status=status)

    response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert response.status_code == 201


def test_api_breakout_sessions_create_rows_fail(livekit, owner_room):
    """Rows that cannot be written leave no session and announce nothing."""
    room, client = owner_room

    with mock.patch.object(
        models.BreakoutAssignment.objects, "bulk_create", side_effect=IntegrityError
    ):
        response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert response.status_code == 409
    assert not models.BreakoutSession.objects.exists()
    livekit.room.update_room_metadata.assert_not_awaited()


def test_api_breakout_sessions_create_meeting_not_live(livekit, owner_room):
    """With nobody in the meeting no browser splits, so the session is undone."""
    room, client = owner_room
    livekit.room.list_rooms.return_value = mock.Mock(rooms=[])

    response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert response.status_code == 503
    assert not models.BreakoutSession.objects.exists()


def test_api_breakout_sessions_create_signal_times_out_after_landing(
    livekit, owner_room
):
    """A signal write that lands, then times out, is taken back."""
    room, client = owner_room
    update = livekit.room.update_room_metadata
    store = update.side_effect

    async def land_then_time_out(request):
        await store(request)
        if update.await_count == 1:
            raise TimeoutError

    update.side_effect = land_then_time_out

    response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert response.status_code == 503
    assert "breakout" in json.loads(update.await_args_list[0].args[0].metadata)
    assert written_metadata(livekit) == {"access_level": "public"}
    assert not models.BreakoutSession.objects.exists()


def test_api_breakout_sessions_create_take_back_fails(livekit, owner_room):
    """A signal that may have landed and cannot be taken back keeps its session to close."""
    room, client = owner_room
    store = livekit.room.update_room_metadata.side_effect
    livekit.room.update_room_metadata.side_effect = TimeoutError

    response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert response.status_code == 503
    session = models.BreakoutSession.objects.get()
    assert session.status == ACTIVE
    assert [s["id"] for s in client.get(url(room)).json()] == [str(session.id)]

    livekit.room.update_room_metadata.side_effect = store
    response = client.post(url(room, f"{session.id!s}/close/"))

    assert response.status_code == 200
    assert "breakout" not in written_metadata(livekit)


def test_api_breakout_sessions_media_server_call_is_bounded(livekit, owner_room):
    """A media server that never answers costs two deadlines and the lock between them."""
    room, client = owner_room

    async def hang(*args, **kwargs):
        await asyncio.sleep(60)

    livekit.room.update_room_metadata.side_effect = hang

    started = time.monotonic()
    with mock.patch.object(room_management, "MEDIA_SERVER_TIMEOUT_SECONDS", 0.05):
        response = client.post(url(room), payload(["alice"], ["bob"]), "json")

    assert time.monotonic() - started < 1
    assert response.status_code == 503
    assert livekit.room.update_room_metadata.await_count == 2


# Recording


@pytest.mark.parametrize("split", [True, False])
def test_start_recording_during_a_split(livekit, owner_room, settings, split):
    """A recording cannot start while the meeting is split."""
    settings.RECORDING_ENABLE = True
    room, client = owner_room
    if split:
        make_session(room, ["alice"], ["bob"])

    with mock.patch("core.api.viewsets.WorkerServiceMediator"):
        response = client.post(
            f"/api/v1.0/rooms/{room.id!s}/start-recording/",
            {"mode": "screen_recording"},
        )

    assert response.status_code == (409 if split else 201)
    assert models.Recording.objects.exists() is not split


# List


def test_api_breakout_sessions_list(livekit, owner_room):
    """The owner reads the active session only."""
    room, client = owner_room
    make_session(room, ["alice"])
    models.BreakoutSession.objects.update(status=CLOSED)
    session = make_session(room, ["alice"], ["bob"])

    response = client.get(url(room))

    assert response.status_code == 200
    assert [s["id"] for s in response.json()] == [str(session.id)]
    assert [
        [p["identity"] for p in r["participants"]] for r in response.json()[0]["rooms"]
    ] == [["alice"], ["bob"]]


def test_api_breakout_sessions_list_empty_and_member(livekit, owner_room):
    """No session reads as an empty list, and a member reads nothing."""
    room, client = owner_room
    assert client.get(url(room)).json() == []

    _member, member_client = logged_in(room, "member")
    assert member_client.get(url(room)).status_code == 403


# Close


def test_api_breakout_sessions_close(livekit, owner_room):
    """Close removes the signal, and a second close answers 200 without a write."""
    room, client = owner_room
    client.post(url(room), payload(["alice"], ["bob"]), "json")
    session = models.BreakoutSession.objects.get()
    assert "breakout" in written_metadata(livekit)

    response = client.post(url(room, f"{session.id!s}/close/"))

    assert response.status_code == 200
    assert response.json()["status"] == "closed"
    session.refresh_from_db()
    assert session.status == CLOSED
    assert session.closed_at is not None
    assert written_metadata(livekit) == {"access_level": "public"}

    livekit.reset_mock()
    assert client.post(url(room, f"{session.id!s}/close/")).status_code == 200
    livekit.room.update_room_metadata.assert_not_awaited()


def test_api_breakout_sessions_close_meeting_not_live(livekit, owner_room):
    """A meeting the media server no longer holds has no signal left to remove."""
    room, client = owner_room
    session = make_session(room, ["alice"], ["bob"])
    livekit.room.list_rooms.return_value = mock.Mock(rooms=[])

    response = client.post(url(room, f"{session.id!s}/close/"))

    assert response.status_code == 200
    assert response.json()["status"] == "closed"


def test_api_breakout_sessions_close_signal_fails_then_retries(livekit, owner_room):
    """A signal removal that fails keeps the session active, and closing again ends it."""
    room, client = owner_room
    session = make_session(room, ["alice"], ["bob"])
    livekit.room.update_room_metadata.side_effect = TimeoutError

    response = client.post(url(room, f"{session.id!s}/close/"))

    assert response.status_code == 503
    assert [s["status"] for s in client.get(url(room)).json()] == ["active"]

    livekit.room.update_room_metadata.side_effect = None
    response = client.post(url(room, f"{session.id!s}/close/"))

    assert response.status_code == 200
    assert response.json()["status"] == "closed"


def test_api_breakout_sessions_close_member(livekit, owner_room):
    """A member cannot close a session."""
    room, _client = owner_room
    session = make_session(room, ["alice"], ["bob"])
    _member, client = logged_in(room, "member")

    response = client.post(url(room, f"{session.id!s}/close/"))

    assert response.status_code == 403
    livekit.room.update_room_metadata.assert_not_awaited()


def test_api_breakout_sessions_close_other_meeting(livekit, owner_room):
    """A host's meeting in the URL never reaches another meeting's session."""
    room, client = owner_room
    other = make_session(RoomFactory(), ["alice"], ["bob"])

    response = client.post(url(room, f"{other.id!s}/close/"))

    assert response.status_code == 404
    other.refresh_from_db()
    assert other.status == ACTIVE
    livekit.room.update_room_metadata.assert_not_awaited()


def test_api_breakout_sessions_administrator(livekit):
    """An administrator lists, opens and closes like the owner."""
    room = RoomFactory()
    _admin, client = logged_in(room, "administrator")

    response = client.post(url(room), payload(["alice"], ["bob"]), "json")
    assert response.status_code == 201
    session_id = response.json()["id"]
    assert [s["id"] for s in client.get(url(room)).json()] == [session_id]
    assert client.post(url(room, f"{session_id}/close/")).status_code == 200


def test_api_breakout_sessions_anonymous(livekit, owner_room):
    """Someone signed out can neither list nor close."""
    room, _client = owner_room
    session = make_session(room, ["alice"], ["bob"])

    assert APIClient().get(url(room)).status_code == 401
    assert APIClient().post(url(room, f"{session.id!s}/close/")).status_code == 401
    session.refresh_from_db()
    assert session.status == ACTIVE


# Flag


def test_api_breakout_sessions_flag_off(livekit, owner_room, settings):
    """Flag off, opening answers 404, and a split left open can still be closed."""
    settings.BREAKOUT_ROOMS_ENABLED = False
    room, client = owner_room
    session = make_session(room, ["alice"], ["bob"])

    assert client.post(url(room), payload(["a"], ["b"]), "json").status_code == 404
    assert [s["id"] for s in client.get(url(room)).json()] == [str(session.id)]
    assert client.post(url(room, f"{session.id!s}/close/")).status_code == 200
    session.refresh_from_db()
    assert session.status == CLOSED
