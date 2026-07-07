"""
Test rooms API endpoints in the Meet core app: update-participant-role.
"""

# pylint: disable=redefined-outer-name,unused-argument

import uuid
from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import ResourceAccess, RoleChoices
from ...services.participants_management import ParticipantNotFoundException

pytestmark = pytest.mark.django_db


def test_update_participant_role_anonymous():
    """Anonymous requesters are rejected."""
    client = APIClient()
    room = RoomFactory()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": "some-identity", "role": "administrator"},
        format="json",
    )

    assert response.status_code == 401


def test_update_participant_role_requires_privileges():
    """A simple member cannot promote other participants."""
    client = APIClient()
    user = UserFactory()
    room = RoomFactory(users=[(user, RoleChoices.MEMBER)])
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": "some-identity", "role": "administrator"},
        format="json",
    )

    assert response.status_code == 403


@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_requester_not_in_meeting(mock_perm_pm):
    """An admin who is not connected to the meeting is rejected."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = False
    client = APIClient()
    user = UserFactory()
    room = RoomFactory(users=[(user, RoleChoices.ADMIN)])
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": "some-identity", "role": "administrator"},
        format="json",
    )

    assert response.status_code == 403
    mock_perm_pm.return_value.check_if_in_meeting.assert_called_once_with(
        room_name=str(room.pk), identity=str(user.sub)
    )


@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_cannot_target_self(mock_perm_pm):
    """Requesters cannot change their own role."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    client = APIClient()
    user = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(user, RoleChoices.ADMIN)])
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": user.sub, "role": "member"},
        format="json",
    )

    assert response.status_code == 403
    assert response.json() == {"error": "You cannot change your own role."}


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_promotes_authenticated_target(
    mock_perm_pm, mock_svc_pm, mock_sync
):
    """Promoting a connected, authenticated participant persists the role."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.check_if_in_meeting.return_value = True
    mock_sync.return_value = True

    client = APIClient()
    admin = UserFactory()
    target = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(admin, RoleChoices.OWNER)])
    client.force_login(admin)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": str(target.sub), "role": "administrator"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "role": "administrator",
        "livekit_synced": True,
    }
    access = ResourceAccess.objects.get(resource=room, user=target)
    assert access.role == RoleChoices.ADMIN
    mock_sync.assert_called_once_with(
        room_name=str(room.pk),
        participant_identity=str(target.sub),
        is_admin=True,
    )


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_demotes_authenticated_target(
    mock_perm_pm, mock_svc_pm, mock_sync
):
    """Demoting a connected admin back to member updates the access row."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.check_if_in_meeting.return_value = True
    mock_sync.return_value = True

    client = APIClient()
    admin = UserFactory()
    target = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(admin, RoleChoices.OWNER), (target, RoleChoices.ADMIN)])
    client.force_login(admin)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": str(target.sub), "role": "member"},
        format="json",
    )

    assert response.status_code == 200
    access = ResourceAccess.objects.get(resource=room, user=target)
    assert access.role == RoleChoices.MEMBER


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_cannot_demote_owner(
    mock_perm_pm, mock_svc_pm, mock_sync
):
    """Room owners can never be demoted."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.check_if_in_meeting.return_value = True

    client = APIClient()
    admin = UserFactory()
    owner = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(admin, RoleChoices.ADMIN), (owner, RoleChoices.OWNER)])
    client.force_login(admin)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": str(owner.sub), "role": "member"},
        format="json",
    )

    assert response.status_code == 403
    assert response.json() == {"error": "Room owners cannot be demoted."}
    assert (
        ResourceAccess.objects.get(resource=room, user=owner).role == RoleChoices.OWNER
    )
    mock_sync.assert_not_called()


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_anonymous_target_is_ephemeral(
    mock_perm_pm, mock_svc_pm, mock_sync
):
    """Promoting an anonymous participant should not be possible."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.check_if_in_meeting.return_value = True
    mock_sync.return_value = True

    client = APIClient()
    admin = UserFactory()
    room = RoomFactory(users=[(admin, RoleChoices.ADMIN)])
    client.force_login(admin)

    anonymous_identity = uuid.uuid4()
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": anonymous_identity, "role": "administrator"},
        format="json",
    )

    assert response.status_code == 404
    assert response.json() == {
        "error": "This participant has no user account and cannot be assigned a role."
    }
    assert not ResourceAccess.objects.filter(resource=room).exclude(user=admin).exists()


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_target_not_in_meeting(
    mock_perm_pm, mock_svc_pm, mock_sync
):
    """Only connected participants can be promoted or demoted."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.check_if_in_meeting.side_effect = (
        ParticipantNotFoundException("Participant does not exist")
    )

    client = APIClient()
    admin = UserFactory()
    target = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(admin, RoleChoices.ADMIN)])
    client.force_login(admin)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": str(target.sub), "role": "administrator"},
        format="json",
    )

    assert response.status_code == 404
    assert not ResourceAccess.objects.filter(resource=room, user=target).exists()
    mock_sync.assert_not_called()


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_is_idempotent_and_resyncs(
    mock_perm_pm, mock_svc_pm, mock_sync
):
    """Promoting an existing admin succeeds and still re-syncs LiveKit."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.check_if_in_meeting.return_value = True
    mock_sync.return_value = True

    client = APIClient()
    admin = UserFactory()
    target = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(admin, RoleChoices.OWNER), (target, RoleChoices.ADMIN)])
    client.force_login(admin)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": str(target.sub), "role": "administrator"},
        format="json",
    )

    assert response.status_code == 200
    mock_sync.assert_called_once()


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_livekit_failure_reports_partial_success(
    mock_perm_pm, mock_svc_pm, mock_sync
):
    """A LiveKit sync failure does not lose the persisted role."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.check_if_in_meeting.return_value = True
    mock_sync.return_value = False

    client = APIClient()
    admin = UserFactory()
    target = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(admin, RoleChoices.OWNER)])
    client.force_login(admin)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": str(target.sub), "role": "administrator"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "role": "administrator",
        "livekit_synced": False,
    }
    assert (
        ResourceAccess.objects.get(resource=room, user=target).role == RoleChoices.ADMIN
    )


@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_rejects_owner_role(mock_perm_pm):
    """The owner role can never be granted through this endpoint."""
    client = APIClient()
    admin = UserFactory()
    room = RoomFactory(users=[(admin, RoleChoices.ADMIN)])
    client.force_login(admin)

    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": "some-identity", "role": "owner"},
        format="json",
    )

    assert response.status_code == 400
