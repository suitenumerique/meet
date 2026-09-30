"""Tests for the RoomManagement service."""

from unittest import mock

from django.db import connection

import pytest
from livekit.api import TwirpError

from core.factories import RoomFactory
from core.models import Room, RoomAccessLevel
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)
from core.services.sip_management import SIPException, SIPManagement


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
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
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
    """A roomkit join creates the dispatch rule before any LiveKit room exists,
    so no room_finished webhook deletes it: the soft delete must, or the
    retained PIN would still route SIP calls to the deleted room."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    setattr(settings, sip_setting, True)
    room = RoomFactory()

    RoomManagement.soft_delete(room)

    mock_delete_room.assert_called_once_with(str(room.id))
    mock_delete_dispatch_rule.assert_called_once_with(room.id)
    assert Room.all_objects.get(id=room.id).is_deleted


@pytest.mark.django_db
def test_soft_delete_live_room_deletes_dispatch_rule_after_closing_it(settings):
    """The dispatch rule of a live room is deleted only once the LiveKit room is
    closed, so it keeps routing calls if the closing fails and the deletion is
    rolled back."""
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
        mock.call.delete_room(str(room.id)),
        mock.call.delete_dispatch_rule(room.id),
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
@mock.patch.object(
    SIPManagement,
    "delete_dispatch_rule",
    side_effect=SIPException("Could not delete dispatch rules"),
)
@mock.patch.object(
    RoomManagement,
    "delete_room",
    side_effect=RoomNotFoundException("Room does not exist"),
)
def test_soft_delete_dispatch_rule_failure_rolls_back(
    mock_delete_room, mock_delete_dispatch_rule, settings
):
    """A dispatch rule that can't be deleted fails the soft delete like a LiveKit
    room that can't be closed: it is rolled back so it can be retried."""
    settings.ROOMKIT_ENABLED = True
    room = RoomFactory()

    with pytest.raises(RoomManagementException):
        RoomManagement.soft_delete(room)

    mock_delete_room.assert_called_once_with(str(room.id))
    mock_delete_dispatch_rule.assert_called_once_with(room.id)
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
