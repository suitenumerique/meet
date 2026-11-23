"""
Test rooms API endpoints in the Meet core app: update-participant-role.
"""

# pylint: disable=redefined-outer-name,unused-argument,no-name-in-module

import uuid
from unittest import mock

import pytest
from livekit.protocol.models import ParticipantInfo, ParticipantPermission
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import ResourceAccess, RoleChoices
from ...services.participants_management import (
    ParticipantNotFoundException,
    ParticipantsManagementException,
)

pytestmark = pytest.mark.django_db

ALL_SOURCES = ["CAMERA", "MICROPHONE", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"]


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


@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_promotes_authenticated_target(
    mock_perm_pm, mock_svc_pm
):
    """Promoting a connected, authenticated participant persists the role."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.return_value = ParticipantInfo(
        attributes={"room_role": "member"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=True,
            can_publish_data=True,
            can_publish_sources=ALL_SOURCES,
        ),
    )

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
    mock_svc_pm.return_value.get_participant.assert_called_once_with(
        room_name=str(room.pk), identity=str(target.sub)
    )
    mock_svc_pm.return_value.update.assert_called_once_with(
        room_name=str(room.pk),
        identity=str(target.sub),
        attributes={"room_role": "administrator"},
    )


@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_demotes_authenticated_target(
    mock_perm_pm, mock_svc_pm
):
    """Demoting a connected admin back to member updates the access row."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.return_value = ParticipantInfo(
        attributes={"room_role": "administrator"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=True,
            can_publish_data=True,
            can_publish_sources=ALL_SOURCES,
        ),
    )

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
    mock_svc_pm.return_value.update.assert_called_once_with(
        room_name=str(room.pk),
        identity=str(target.sub),
        attributes={"room_role": "member"},
    )


@pytest.mark.parametrize(
    "room_sources",
    [["CAMERA", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"], ["CAMERA"], []],
)
@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_promotion_lifts_room_restrictions(
    mock_perm_pm, mock_svc_pm, room_sources
):
    """A promoted participant can publish the sources the room forbids to members."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.return_value = ParticipantInfo(
        attributes={"room_role": "member"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=bool(room_sources),
            can_publish_data=True,
            can_publish_sources=room_sources,
        ),
    )

    client = APIClient()
    admin = UserFactory()
    target = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(
        users=[(admin, RoleChoices.OWNER)],
        configuration={"can_publish_sources": [s.lower() for s in room_sources]},
    )
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
    mock_svc_pm.return_value.update.assert_called_once_with(
        room_name=str(room.pk),
        identity=str(target.sub),
        attributes={"room_role": "administrator"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=True,
            can_publish_data=True,
            can_publish_sources=ALL_SOURCES,
        ),
    )


@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_promotion_restores_disabled_publishing(
    mock_perm_pm, mock_svc_pm
):
    """A promoted participant can publish again when publishing was switched off."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.return_value = ParticipantInfo(
        attributes={"room_role": "member"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=False,
            can_publish_data=True,
            can_publish_sources=ALL_SOURCES,
        ),
    )

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
    mock_svc_pm.return_value.update.assert_called_once_with(
        room_name=str(room.pk),
        identity=str(target.sub),
        attributes={"room_role": "administrator"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=True,
            can_publish_data=True,
            can_publish_sources=ALL_SOURCES,
        ),
    )


@pytest.mark.parametrize(
    "room_sources",
    [["CAMERA", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"], ["CAMERA"], []],
)
@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_demotion_applies_room_restrictions(
    mock_perm_pm, mock_svc_pm, room_sources
):
    """A demoted participant can only publish the sources the room allows."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.return_value = ParticipantInfo(
        attributes={"room_role": "administrator"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=True,
            can_publish_data=True,
            can_publish_sources=ALL_SOURCES,
        ),
    )

    client = APIClient()
    admin = UserFactory()
    target = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(
        users=[(admin, RoleChoices.OWNER), (target, RoleChoices.ADMIN)],
        configuration={"can_publish_sources": [s.lower() for s in room_sources]},
    )
    client.force_login(admin)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": str(target.sub), "role": "member"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "role": "member",
        "livekit_synced": True,
    }
    mock_svc_pm.return_value.update.assert_called_once_with(
        room_name=str(room.pk),
        identity=str(target.sub),
        attributes={"room_role": "member"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=bool(room_sources),
            can_publish_data=True,
            can_publish_sources=room_sources,
        ),
    )


@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_cannot_demote_owner(mock_perm_pm, mock_svc_pm):
    """Room owners can never be demoted."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.return_value = ParticipantInfo(
        attributes={"room_role": "owner"}
    )

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
    mock_svc_pm.return_value.update.assert_not_called()


@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_anonymous_target_is_ephemeral(
    mock_perm_pm, mock_svc_pm
):
    """Promoting an anonymous participant should not be possible."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.return_value = ParticipantInfo()

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
    mock_svc_pm.return_value.update.assert_not_called()


@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_target_not_in_meeting(mock_perm_pm, mock_svc_pm):
    """Only connected participants can be promoted or demoted."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.side_effect = ParticipantNotFoundException(
        "Participant does not exist"
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
    mock_svc_pm.return_value.update.assert_not_called()


@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_is_idempotent_and_resyncs(mock_perm_pm, mock_svc_pm):
    """Promoting an existing admin succeeds and re-syncs a stale LiveKit state."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.return_value = ParticipantInfo(
        attributes={"room_role": "member"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=True,
            can_publish_data=True,
            can_publish_sources=["CAMERA"],
        ),
    )

    client = APIClient()
    admin = UserFactory()
    target = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(
        users=[(admin, RoleChoices.OWNER), (target, RoleChoices.ADMIN)],
        configuration={"can_publish_sources": ["camera"]},
    )
    client.force_login(admin)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/update-participant-role/",
        {"participant_identity": str(target.sub), "role": "administrator"},
        format="json",
    )

    assert response.status_code == 200
    mock_svc_pm.return_value.update.assert_called_once_with(
        room_name=str(room.pk),
        identity=str(target.sub),
        attributes={"room_role": "administrator"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=True,
            can_publish_data=True,
            can_publish_sources=ALL_SOURCES,
        ),
    )


@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_skips_livekit_when_already_synced(
    mock_perm_pm, mock_svc_pm
):
    """LiveKit is not updated when the participant already holds the role."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.return_value = ParticipantInfo(
        attributes={"room_role": "administrator"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=True,
            can_publish_data=True,
            can_publish_sources=ALL_SOURCES,
        ),
    )

    client = APIClient()
    admin = UserFactory()
    target = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(
        users=[(admin, RoleChoices.OWNER), (target, RoleChoices.ADMIN)],
        configuration={"can_publish_sources": ["camera"]},
    )
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
    mock_svc_pm.return_value.update.assert_not_called()


@pytest.mark.parametrize(
    "error", [ParticipantNotFoundException, ParticipantsManagementException]
)
@mock.patch("core.services.room_roles.ParticipantsManagement")
@mock.patch("core.api.permissions.ParticipantsManagement")
def test_update_participant_role_livekit_failure_reports_partial_success(
    mock_perm_pm, mock_svc_pm, error
):
    """A LiveKit sync failure does not lose the persisted role."""
    mock_perm_pm.return_value.check_if_in_meeting.return_value = True
    mock_svc_pm.return_value.get_participant.return_value = ParticipantInfo(
        attributes={"room_role": "member"},
        permission=ParticipantPermission(
            can_subscribe=True,
            can_publish=True,
            can_publish_data=True,
            can_publish_sources=ALL_SOURCES,
        ),
    )
    mock_svc_pm.return_value.update.side_effect = error

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
