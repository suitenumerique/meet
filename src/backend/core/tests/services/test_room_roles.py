"""Tests for RoomRoleService LiveKit synchronization."""

from unittest import mock
from uuid import uuid4

import pytest
from livekit.api import TwirpError, TwirpErrorCode
from livekit.protocol.models import ParticipantInfo, ParticipantPermission, TrackSource

from core.services.participants_management import (
    ParticipantNotFoundException,
    ParticipantsManagement,
    ParticipantsManagementException,
)
from core.services.room_roles import RoomRoleService


class DummyRoom:
    """Mock room object for unit tests."""

    def __init__(self, pk=None, configuration=None):
        self.pk = pk or uuid4()
        self.configuration = configuration or {}


@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_sync_livekit_role_promotes_to_admin_restores_all_default_sources(mock_pm_cls):
    """When promoting to admin, participant receives all default publish sources."""
    mock_pm = mock_pm_cls.return_value
    existing_permission = ParticipantPermission(
        can_subscribe=True,
        can_publish=True,
        can_publish_data=True,
        can_publish_sources=["CAMERA"],
    )
    mock_pm.get_participant.return_value = ParticipantInfo(
        identity="target-user-1",
        permission=existing_permission,
    )

    room = DummyRoom(configuration={"can_publish_sources": ["camera"]})

    result = RoomRoleService._sync_livekit_role(
        room_name=str(room.pk),
        participant_identity="target-user-1",
        role="administrator",
        room=room,
    )

    assert result is True
    mock_pm.get_participant.assert_called_once_with(
        room_name=str(room.pk),
        identity="target-user-1",
    )
    mock_pm.update.assert_called_once()
    _, kwargs = mock_pm.update.call_args
    assert kwargs["room_name"] == str(room.pk)
    assert kwargs["identity"] == "target-user-1"
    assert kwargs["attributes"] == {"room_role": "administrator"}
    permission = kwargs["permission"]
    assert permission.can_publish is True
    assert list(permission.can_publish_sources) == [
        TrackSource.CAMERA,
        TrackSource.MICROPHONE,
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO,
    ]


@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_sync_livekit_role_demotes_to_member_applies_room_restrictions(mock_pm_cls):
    """When demoting to member, participant receives room-configured publish sources."""
    mock_pm = mock_pm_cls.return_value
    existing_permission = ParticipantPermission(
        can_subscribe=True,
        can_publish=True,
        can_publish_data=True,
        can_publish_sources=[
            "CAMERA",
            "MICROPHONE",
            "SCREEN_SHARE",
            "SCREEN_SHARE_AUDIO",
        ],
    )
    mock_pm.get_participant.return_value = ParticipantInfo(
        identity="target-user-2",
        permission=existing_permission,
    )

    room = DummyRoom(configuration={"can_publish_sources": ["camera", "screen_share"]})

    result = RoomRoleService._sync_livekit_role(
        room_name=str(room.pk),
        participant_identity="target-user-2",
        role="member",
        room=room,
    )

    assert result is True
    mock_pm.update.assert_called_once()
    _, kwargs = mock_pm.update.call_args
    assert kwargs["attributes"] == {"room_role": "member"}
    permission = kwargs["permission"]
    assert permission.can_publish is True
    assert list(permission.can_publish_sources) == [
        TrackSource.CAMERA,
        TrackSource.SCREEN_SHARE,
    ]


@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_sync_livekit_role_demotes_to_member_empty_sources_disables_publish(
    mock_pm_cls,
):
    """When demoting to member in a room with empty publish sources, can_publish is False."""
    mock_pm = mock_pm_cls.return_value
    existing_permission = ParticipantPermission(
        can_subscribe=True,
        can_publish=True,
        can_publish_data=True,
        can_publish_sources=["CAMERA"],
    )
    mock_pm.get_participant.return_value = ParticipantInfo(
        identity="target-user-3",
        permission=existing_permission,
    )

    room = DummyRoom(configuration={"can_publish_sources": []})

    result = RoomRoleService._sync_livekit_role(
        room_name=str(room.pk),
        participant_identity="target-user-3",
        role="member",
        room=room,
    )

    assert result is True
    mock_pm.update.assert_called_once()
    _, kwargs = mock_pm.update.call_args
    permission = kwargs["permission"]
    assert permission.can_publish is False
    assert list(permission.can_publish_sources) == []


@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_sync_livekit_role_handles_participant_not_found(mock_pm_cls):
    """When participant is not found in LiveKit, returns False and does not raise."""
    mock_pm = mock_pm_cls.return_value
    mock_pm.get_participant.side_effect = ParticipantNotFoundException("Not found")

    room = DummyRoom()
    result = RoomRoleService._sync_livekit_role(
        room_name=str(room.pk),
        participant_identity="target-user-4",
        role="administrator",
        room=room,
    )

    assert result is False
    mock_pm.update.assert_not_called()


@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_sync_livekit_role_handles_livekit_error(mock_pm_cls):
    """When LiveKit update fails with ParticipantsManagementException, returns False."""
    mock_pm = mock_pm_cls.return_value
    mock_pm.get_participant.side_effect = ParticipantsManagementException("Twirp error")

    room = DummyRoom()
    result = RoomRoleService._sync_livekit_role(
        room_name=str(room.pk),
        participant_identity="target-user-5",
        role="administrator",
        room=room,
    )

    assert result is False


@mock.patch("core.services.participants_management.utils.create_livekit_client")
def test_get_participant_success(mock_create_livekit_client):
    """ParticipantsManagement.get_participant fetches participant info successfully."""
    mock_api = mock.MagicMock()
    expected_participant = ParticipantInfo(
        identity="user-abc",
        state=ParticipantInfo.State.ACTIVE,
    )
    mock_api.room.get_participant = mock.AsyncMock(return_value=expected_participant)
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    pm = ParticipantsManagement()
    participant = pm.get_participant("room-123", "user-abc")

    assert participant == expected_participant
    mock_api.room.get_participant.assert_awaited_once()
    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.participants_management.utils.create_livekit_client")
def test_get_participant_not_found_raises(mock_create_livekit_client):
    """When participant does not exist, raises ParticipantNotFoundException."""
    mock_api = mock.MagicMock()
    mock_api.room.get_participant = mock.AsyncMock(
        side_effect=TwirpError(
            code=TwirpErrorCode.NOT_FOUND,
            msg="participant does not exist",
            status=404,
        )
    )
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    pm = ParticipantsManagement()
    with pytest.raises(ParticipantNotFoundException):
        pm.get_participant("room-123", "user-nonexistent")

    mock_api.aclose.assert_awaited_once()


@mock.patch("core.services.participants_management.utils.create_livekit_client")
def test_get_participant_disconnected_raises(mock_create_livekit_client):
    """When participant is DISCONNECTED, raises ParticipantNotFoundException."""
    mock_api = mock.MagicMock()
    disconnected_participant = ParticipantInfo(
        identity="user-disc",
        state=ParticipantInfo.State.DISCONNECTED,
    )
    mock_api.room.get_participant = mock.AsyncMock(
        return_value=disconnected_participant
    )
    mock_api.aclose = mock.AsyncMock()
    mock_create_livekit_client.return_value = mock_api

    pm = ParticipantsManagement()
    with pytest.raises(ParticipantNotFoundException):
        pm.get_participant("room-123", "user-disc")

    mock_api.aclose.assert_awaited_once()
