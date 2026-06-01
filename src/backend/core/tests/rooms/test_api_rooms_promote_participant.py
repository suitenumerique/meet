"""
Test rooms API endpoints: promote participant.
"""

# pylint: disable=redefined-outer-name,unused-argument,protected-access

import random
from unittest import mock
from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from core import models
from core.factories import RoomFactory, UserFactory, UserResourceAccessFactory
from core.services.participants_management import (
    ParticipantNotFoundException,
    ParticipantsManagementException,
)

pytestmark = pytest.mark.django_db


# ---
# success cases
# ---


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_success_new_access(mock_participants_management_cls):
    """Should create a new ResourceAccess with ADMIN role and update LiveKit."""
    mock_instance = mock.MagicMock()
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    participant_user = UserFactory(sub=uuid4())

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(participant_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_instance.check_if_in_meeting.assert_called_once_with(
        room.pk, identity=participant_user.sub
    )

    assert models.ResourceAccess.objects.filter(
        resource=room,
        user=participant_user,
        role=models.RoleChoices.ADMIN,
    ).exists()

    mock_instance.update.assert_called_once_with(
        room_name=str(room.pk),
        identity=str(participant_user.sub),
        attributes={"room_admin": "true"},
    )


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_success_upgrades_member_to_admin(
    mock_participants_management_cls,
):
    """Should upgrade an existing member to ADMIN role."""
    mock_instance = mock.MagicMock()
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    participant_user = UserFactory(sub=uuid4())
    UserResourceAccessFactory(resource=room, user=participant_user, role="member")

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(participant_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_instance.check_if_in_meeting.assert_called_once_with(
        room.pk, identity=str(participant_user.sub)
    )

    access = models.ResourceAccess.objects.get(resource=room, user=participant_user)
    assert access.role == models.RoleChoices.ADMIN


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_success_already_admin(mock_participants_management_cls):
    """Should succeed idempotently when the participant is already an admin."""
    mock_instance = mock.MagicMock()
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    participant_user = UserFactory(sub=uuid4())
    UserResourceAccessFactory(
        resource=room, user=participant_user, role="administrator"
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(participant_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_instance.check_if_in_meeting.assert_called_once_with(
        room.pk, identity=str(participant_user.sub)
    )

    access = models.ResourceAccess.objects.get(resource=room, user=participant_user)
    assert access.role == models.RoleChoices.ADMIN
    mock_instance.update.assert_not_called()


# ---
# permission / auth
# ---


def test_promote_participant_forbidden_without_authentication():
    """Should return 401 when the request is unauthenticated."""
    room = RoomFactory()

    response = APIClient().post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(uuid4())},
        format="json",
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_promote_participant_forbidden_for_member():
    """Should return 403 when the requester only has member-level access."""
    room = RoomFactory()
    member = UserFactory()
    UserResourceAccessFactory(resource=room, user=member, role="member")

    client = APIClient()
    client.force_authenticate(user=member)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(uuid4())},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_promote_participant_forbidden_for_unrelated_user():
    """Should return 403 when the requester has no access to the room."""
    room = RoomFactory()
    unrelated_user = UserFactory()

    client = APIClient()
    client.force_authenticate(user=unrelated_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(uuid4())},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_promote_participant_forbidden_for_admin_on_another_room():
    """Should return 403 when the requester is admin on a different room, not the target one."""
    target_room = RoomFactory()
    other_room = RoomFactory()
    admin_other_room = UserFactory()
    UserResourceAccessFactory(
        resource=other_room,
        user=admin_other_room,
        role=random.choice(["administrator", "owner"]),
    )

    client = APIClient()
    client.force_authenticate(user=admin_other_room)

    response = client.post(
        f"/api/v1.0/rooms/{target_room.id}/promote-participant/",
        {"participant_identity": str(uuid4())},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


# ---
# self-promotion
# ---


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_forbidden_self_promotion(mock_participants_management_cls):
    """Should return 403 when the requester attempts to promote themselves."""
    mock_participants_management_cls.return_value = mock.MagicMock()

    room = RoomFactory()
    admin_user = UserFactory(sub=uuid4())
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(admin_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data == {"error": "You cannot promote yourself"}

    mock_participants_management_cls.check_if_in_meeting.assert_not_called()


# ---
# presence check
# ---


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_forbidden_when_participant_not_in_meeting(
    mock_participants_management_cls,
):
    """Should return 403 when check_if_in_meeting returns False."""
    mock_instance = mock.MagicMock()
    mock_instance.check_if_in_meeting.return_value = False
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    participant_user = UserFactory(sub=uuid4())

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(participant_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data == {"error": "Could not verify participant presence"}
    mock_instance.update.assert_not_called()
    assert not models.ResourceAccess.objects.filter(
        resource=room, user=participant_user
    ).exists()


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_forbidden_when_presence_check_fails(
    mock_participants_management_cls,
):
    """Should return 403 when the participant is not found in the meeting."""
    mock_instance = mock.MagicMock()
    mock_instance.check_if_in_meeting.side_effect = ParticipantNotFoundException()
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    participant_user = UserFactory(sub=uuid4())

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(participant_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data == {"error": "Could not verify participant presence"}
    mock_instance.update.assert_not_called()
    assert not models.ResourceAccess.objects.filter(
        resource=room, user=participant_user
    ).exists()


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_forbidden_when_presence_management_exception(
    mock_participants_management_cls,
):
    """Should return 403 when the presence check raises a management exception."""
    mock_instance = mock.MagicMock()
    mock_instance.check_if_in_meeting.side_effect = ParticipantsManagementException()
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    participant_user = UserFactory(sub=uuid4())

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(participant_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data == {"error": "Could not verify participant presence"}
    mock_instance.update.assert_not_called()
    assert not models.ResourceAccess.objects.filter(
        resource=room, user=participant_user
    ).exists()


# ---
# user resolution
# ---


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_not_found_when_user_never_logged_in(
    mock_participants_management_cls,
):
    """Should return 404 when the identity has no matching db user."""
    mock_instance = mock.MagicMock()
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    unknown_sub = uuid4()

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(unknown_sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data == {"error": "Participant not found"}
    mock_instance.update.assert_not_called()

    assert models.ResourceAccess.objects.filter(resource=room).count() == 1
    assert models.ResourceAccess.objects.filter(resource=room, user=admin_user).exists()


# ---
# inactive user
# ---


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_forbidden_when_user_is_inactive(
    mock_participants_management_cls,
):
    """Should return 403 when the target participant account is inactive."""
    mock_instance = mock.MagicMock()
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    participant_user = UserFactory(sub=uuid4(), is_active=False)

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(participant_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data == {
        "error": "This participant account is inactive and cannot be promoted"
    }
    mock_instance.update.assert_not_called()
    assert not models.ResourceAccess.objects.filter(
        resource=room, user=participant_user
    ).exists()


# ---
# owner protection
# ---


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_forbidden_when_target_is_owner(
    mock_participants_management_cls,
):
    """Should return 403 when trying to promote a participant who is already an owner."""
    mock_instance = mock.MagicMock()
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    participant_user = UserFactory(sub=uuid4())
    UserResourceAccessFactory(resource=room, user=participant_user, role="owner")

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(participant_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data == {
        "error": "Owners already have the highest privileges and cannot be promoted"
    }
    mock_instance.update.assert_not_called()

    assert models.ResourceAccess.objects.filter(
        resource=room,
        user=participant_user,
        role=models.RoleChoices.OWNER,
    ).exists()


# ---
# LiveKit update failures
# ---


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_partial_success_when_livekit_participant_missing(
    mock_participants_management_cls,
):
    """Should return 200 with warning when participant left during the promotion.

    The DB resource access is kept — they will have admin privileges on rejoin.
    """
    mock_instance = mock.MagicMock()
    mock_instance.update.side_effect = ParticipantNotFoundException()
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    participant_user = UserFactory(sub=uuid4())

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(participant_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {
        "status": "success",
        "warning": "LiveKit update failed; role update persisted",
    }

    assert models.ResourceAccess.objects.filter(
        resource=room,
        user=participant_user,
        role=models.RoleChoices.ADMIN,
    ).exists()


@mock.patch("core.api.viewsets.ParticipantsManagement")
def test_promote_participant_partial_success_on_livekit_management_exception(
    mock_participants_management_cls,
):
    """Should return 200 with warning when LiveKit update fails but DB transaction succeeded."""
    mock_instance = mock.MagicMock()
    mock_instance.update.side_effect = ParticipantsManagementException()
    mock_participants_management_cls.return_value = mock_instance

    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )
    participant_user = UserFactory(sub=uuid4())

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        {"participant_identity": str(participant_user.sub)},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {
        "status": "success",
        "warning": "LiveKit update failed; role update persisted",
    }

    assert models.ResourceAccess.objects.filter(
        resource=room,
        user=participant_user,
        role=models.RoleChoices.ADMIN,
    ).exists()


# ---
# payload validation
# ---


@pytest.mark.parametrize(
    "payload",
    [
        {"participant_identity": "not-a-uuid"},
        {"participant_identity": ""},
        {"participant_identity": "   "},
        {"participant_identity": None},
        {},
    ],
)
def test_promote_participant_invalid_payload(payload):
    """Should return 400 for invalid, empty, whitespace, null, or missing participant_identity."""
    room = RoomFactory()
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=admin_user, role=random.choice(["administrator", "owner"])
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/promote-participant/",
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---
# room not found
# ---


def test_promote_participant_room_not_found():
    """Should return 404 when the room does not exist."""
    user = UserFactory()

    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(
        f"/api/v1.0/rooms/{uuid4()}/promote-participant/",
        {"participant_identity": str(uuid4())},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
