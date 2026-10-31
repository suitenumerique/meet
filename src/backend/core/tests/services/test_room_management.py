"""Tests for the RoomManagement service."""

# pylint: disable=no-name-in-module

from unittest import mock

from django.db import connection

import aiohttp
import pytest
from livekit.api import (
    ListParticipantsResponse,
    ListRoomsResponse,
    ParticipantInfo,
    ParticipantPermission,
    Room,
    TwirpError,
)

from core.factories import RoomFactory
from core.models import Room, RoomAccessLevel
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)
from core.services.sip_management import SIPException, SIPManagement


def _mock_room(mock_create_livekit_client, rooms, participants=()):
    """Make the mocked LiveKit client answer ListRooms and ListParticipants."""
    mock_api = mock.MagicMock()
    mock_api.room.list_rooms = mock.AsyncMock(
        return_value=ListRoomsResponse(rooms=rooms)
    )
    mock_api.room.list_participants = mock.AsyncMock(
        return_value=ListParticipantsResponse(participants=list(participants))
    )
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api
    return mock_api


def _people(count, **kwargs):
    return [ParticipantInfo(identity=f"p{i}", **kwargs) for i in range(count)]


@pytest.mark.parametrize(
    "max_participants,people,expected",
    [
        (150, 149, False),
        (150, 150, True),
        (150, 151, True),
    ],
)
@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_compares_participants_to_limit(
    mock_create_livekit_client, max_participants, people, expected
):
    """A room is full once the people in it reach its limit."""
    mock_api = _mock_room(
        mock_create_livekit_client,
        rooms=[Room(name="room-abc", max_participants=max_participants)],
        participants=_people(people),
    )

    assert RoomManagement.is_full("room-abc") is expected

    assert list(mock_api.room.list_rooms.await_args.args[0].names) == ["room-abc"]
    assert mock_api.room.list_participants.await_args.args[0].room == "room-abc"
    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_counts_the_list_not_the_lagging_room_count(
    mock_create_livekit_client,
):
    """A join the room's num_participants has not caught up with still counts."""
    _mock_room(
        mock_create_livekit_client,
        rooms=[Room(name="room-abc", max_participants=3, num_participants=1)],
        participants=_people(3),
    )

    assert RoomManagement.is_full("room-abc") is True


@pytest.mark.parametrize(
    "dependent",
    [
        {"kind": ParticipantInfo.Kind.EGRESS},
        {"kind": ParticipantInfo.Kind.AGENT},
        {"permission": ParticipantPermission(recorder=True)},
        {"permission": ParticipantPermission(agent=True)},
    ],
)
@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_leaves_out_recorders_and_agents(mock_create_livekit_client, dependent):
    """Recorders and agents do not take a seat, as in LiveKit's own join check."""
    _mock_room(
        mock_create_livekit_client,
        rooms=[Room(name="room-abc", max_participants=2)],
        participants=_people(1) + [ParticipantInfo(identity="bot", **dependent)],
    )

    assert RoomManagement.is_full("room-abc") is False


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_without_limit(mock_create_livekit_client):
    """A room with no limit is never full, and its participants are not listed."""
    mock_api = _mock_room(
        mock_create_livekit_client, rooms=[Room(name="room-abc", max_participants=0)]
    )

    assert RoomManagement.is_full("room-abc") is False
    mock_api.room.list_participants.assert_not_awaited()


@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_room_not_live(mock_create_livekit_client):
    """A room LiveKit does not know is not full."""
    _mock_room(mock_create_livekit_client, rooms=[])

    assert RoomManagement.is_full("room-abc") is False


@pytest.mark.parametrize(
    "error",
    [
        TwirpError("internal", "boom", status=500),
        aiohttp.ClientConnectionError("connection refused"),
    ],
)
@mock.patch("core.services.room_management.utils.create_livekit_client")
def test_is_full_raises_management_exception(mock_create_livekit_client, error):
    """Twirp and connection errors raise RoomManagementException."""
    mock_api = _mock_room(mock_create_livekit_client, rooms=[])
    mock_api.room.list_rooms.side_effect = error

    with pytest.raises(RoomManagementException):
        RoomManagement.is_full("room-abc")

    mock_api.aclose.assert_awaited_once()


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
