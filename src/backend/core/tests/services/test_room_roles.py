"""Tests for the RoomRoleService."""

# pylint: disable=unused-argument

import uuid
from unittest import mock

from django.core.exceptions import ValidationError
from django.db import IntegrityError

import pytest

from core.factories import RoomFactory, UserFactory
from core.models import ResourceAccess, RoleChoices
from core.services.participants_management import (
    ParticipantNotFoundException,
    ParticipantsManagementException,
)
from core.services.provisional_user_service import (
    ProvisionalUserCreationDisabledError,
)
from core.services.room_roles import GrantAccessResult, RoomRoleService, SelfActionError

pytestmark = pytest.mark.django_db


@pytest.fixture(name="not_in_meeting")
def fixture_not_in_meeting():
    """Default LiveKit state: the delegate is not connected to the meeting."""
    with mock.patch(
        "core.services.room_roles.ParticipantsManagement"
    ) as mock_participants_management:
        mock_participants_management.return_value.check_if_in_meeting.side_effect = (
            ParticipantNotFoundException("Participant does not exist")
        )
        yield mock_participants_management


def test_grant_access_by_email_creates_access(not_in_meeting):
    """Granting access to an existing user creates the access row."""
    actor = UserFactory()
    delegate = UserFactory()
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email=delegate.email,
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result == GrantAccessResult(
        email=delegate.email,
        role=RoleChoices.ADMIN,
        created=True,
        provisional_user_created=False,
    )
    assert room.get_role(delegate) == RoleChoices.ADMIN


def test_grant_access_by_email_is_idempotent(not_in_meeting):
    """Re-granting the same role resolves on the existing access."""
    actor = UserFactory()
    delegate = UserFactory()
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    service = RoomRoleService()
    for _ in range(2):
        result = service.grant_access_by_email(
            room=room,
            actor=actor,
            email=delegate.email,
            role=RoleChoices.ADMIN,
            client_id="test-client",
        )

    assert result.created is False
    assert result.role == RoleChoices.ADMIN
    assert ResourceAccess.objects.filter(resource=room, user=delegate).count() == 1


def test_grant_access_by_email_updates_existing_role(not_in_meeting):
    """Granting a different role updates the existing access row."""
    actor = UserFactory()
    delegate = UserFactory()
    room = RoomFactory(
        users=[(actor, RoleChoices.OWNER), (delegate, RoleChoices.MEMBER)]
    )

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email=delegate.email,
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result.created is False
    assert result.role == RoleChoices.ADMIN
    assert room.get_role(delegate) == RoleChoices.ADMIN


def test_grant_access_by_email_never_demotes_owner(not_in_meeting):
    """An existing owner keeps their role, with an explanatory detail."""
    actor = UserFactory()
    delegate = UserFactory()
    room = RoomFactory(
        users=[(actor, RoleChoices.OWNER), (delegate, RoleChoices.OWNER)]
    )

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email=delegate.email,
        role=RoleChoices.MEMBER,
        client_id="test-client",
    )

    assert result.created is False
    assert result.role == RoleChoices.OWNER
    assert result.detail == "Delegate is already owner of this room."
    assert room.get_role(delegate) == RoleChoices.OWNER


def test_grant_access_by_email_self_action_raises(not_in_meeting):
    """The actor cannot grant access to themselves."""
    actor = UserFactory()
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    with pytest.raises(SelfActionError):
        RoomRoleService().grant_access_by_email(
            room=room,
            actor=actor,
            email=actor.email,
            role=RoleChoices.MEMBER,
            client_id="test-client",
        )

    assert room.get_role(actor) == RoleChoices.OWNER


def test_grant_access_by_email_unknown_delegate_creation_disabled(not_in_meeting):
    """An unknown email raises when provisional user creation is disabled."""
    actor = UserFactory()
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    with pytest.raises(ProvisionalUserCreationDisabledError):
        RoomRoleService().grant_access_by_email(
            room=room,
            actor=actor,
            email="unknown@example.com",
            role=RoleChoices.ADMIN,
            client_id="test-client",
        )


def test_grant_access_by_email_creates_provisional_user(not_in_meeting, settings):
    """An unknown email provisions a user when the configuration allows it."""
    settings.APPLICATION_ALLOW_USER_CREATION = True
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True
    settings.OIDC_USER_SUB_FIELD_IMMUTABLE = False

    actor = UserFactory()
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email="new-delegate@example.com",
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result.created is True
    assert result.provisional_user_created is True


@pytest.mark.parametrize(
    "race_error", [IntegrityError("duplicate"), ValidationError("duplicate")]
)
def test_grant_access_by_email_is_race_safe(not_in_meeting, race_error):
    """A concurrent creation must resolve on the existing access, not fail."""
    actor = UserFactory()
    delegate = UserFactory()
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    # The access is created by a "concurrent" request before ours.
    ResourceAccess.objects.create(resource=room, user=delegate, role=RoleChoices.ADMIN)

    with mock.patch.object(
        ResourceAccess.objects, "get_or_create", side_effect=race_error
    ):
        result = RoomRoleService().grant_access_by_email(
            room=room,
            actor=actor,
            email=delegate.email,
            role=RoleChoices.ADMIN,
            client_id="test-client",
        )

    assert result.created is False
    assert result.role == RoleChoices.ADMIN
    assert ResourceAccess.objects.filter(resource=room, user=delegate).count() == 1


def test_grant_access_result_to_payload():
    """The payload only carries the detail when one is set."""
    result = GrantAccessResult(
        email="delegate@example.com",
        role=RoleChoices.ADMIN,
        created=True,
        provisional_user_created=False,
    )
    assert result.to_payload() == {
        "email": "delegate@example.com",
        "role": RoleChoices.ADMIN,
        "created": True,
        "provisional_user_created": False,
    }

    result.detail = "Delegate is already owner of this room."
    assert result.to_payload()["detail"] == "Delegate is already owner of this room."


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_grant_access_by_email_syncs_connected_delegate(
    mock_participants_management, mock_sync
):
    """A delegate currently in the meeting gets their role pushed to LiveKit."""
    mock_participants_management.return_value.check_if_in_meeting.return_value = True
    mock_sync.return_value = True

    actor = UserFactory()
    delegate = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email=delegate.email,
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result.created is True
    mock_participants_management.return_value.check_if_in_meeting.assert_called_once_with(
        room_name=str(room.pk), identity=str(delegate.sub)
    )
    mock_sync.assert_called_once_with(
        room_name=str(room.pk),
        participant_identity=str(delegate.sub),
        role=RoleChoices.ADMIN,
    )


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_grant_access_by_email_no_sync_when_delegate_absent(
    mock_participants_management, mock_sync
):
    """No LiveKit sync when the delegate is not in the meeting (nominal case)."""
    mock_participants_management.return_value.check_if_in_meeting.side_effect = (
        ParticipantNotFoundException("Participant does not exist")
    )

    actor = UserFactory()
    delegate = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email=delegate.email,
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result.created is True
    mock_sync.assert_not_called()


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_grant_access_by_email_no_sync_for_provisional_user(
    mock_participants_management, mock_sync, settings
):
    """A provisional user has no LiveKit identity: LiveKit is not even queried."""
    settings.APPLICATION_ALLOW_USER_CREATION = True
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True
    settings.OIDC_USER_SUB_FIELD_IMMUTABLE = False

    actor = UserFactory()
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email="new-delegate@example.com",
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result.created is True
    assert result.provisional_user_created is True
    mock_participants_management.assert_not_called()
    mock_sync.assert_not_called()


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_grant_access_by_email_no_sync_when_role_unchanged(
    mock_participants_management, mock_sync
):
    """Re-granting an unchanged role does not touch LiveKit."""
    actor = UserFactory()
    delegate = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(
        users=[(actor, RoleChoices.OWNER), (delegate, RoleChoices.ADMIN)]
    )

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email=delegate.email,
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result.created is False
    mock_participants_management.assert_not_called()
    mock_sync.assert_not_called()


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_grant_access_by_email_syncs_role_update_for_connected_delegate(
    mock_participants_management, mock_sync
):
    """Updating the role of a connected delegate pushes the new role."""
    mock_participants_management.return_value.check_if_in_meeting.return_value = True
    mock_sync.return_value = True

    actor = UserFactory()
    delegate = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(
        users=[(actor, RoleChoices.OWNER), (delegate, RoleChoices.MEMBER)]
    )

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email=delegate.email,
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result.created is False
    assert result.role == RoleChoices.ADMIN
    mock_sync.assert_called_once_with(
        room_name=str(room.pk),
        participant_identity=str(delegate.sub),
        role=RoleChoices.ADMIN,
    )


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_grant_access_by_email_succeeds_when_presence_check_fails(
    mock_participants_management, mock_sync
):
    """A LiveKit failure must never fail the grant."""
    mock_participants_management.return_value.check_if_in_meeting.side_effect = (
        ParticipantsManagementException("Could not verify participant presence")
    )

    actor = UserFactory()
    delegate = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email=delegate.email,
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result.created is True
    assert room.get_role(delegate) == RoleChoices.ADMIN
    mock_sync.assert_not_called()


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_grant_access_by_email_succeeds_on_unexpected_livekit_error(
    mock_participants_management, mock_sync
):
    """Even an unexpected error reaching LiveKit must not fail the grant."""
    mock_participants_management.return_value.check_if_in_meeting.side_effect = (
        ConnectionError("LiveKit unreachable")
    )

    actor = UserFactory()
    delegate = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email=delegate.email,
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result.created is True
    assert room.get_role(delegate) == RoleChoices.ADMIN
    mock_sync.assert_not_called()


@mock.patch("core.services.room_roles.RoomRoleService._sync_livekit_role")
@mock.patch("core.services.room_roles.ParticipantsManagement")
def test_grant_access_by_email_succeeds_when_sync_fails(
    mock_participants_management, mock_sync
):
    """A failed LiveKit sync is reported by `_sync_livekit_role`, not raised."""
    mock_participants_management.return_value.check_if_in_meeting.return_value = True
    mock_sync.return_value = False

    actor = UserFactory()
    delegate = UserFactory(sub=uuid.uuid4())
    room = RoomFactory(users=[(actor, RoleChoices.OWNER)])

    result = RoomRoleService().grant_access_by_email(
        room=room,
        actor=actor,
        email=delegate.email,
        role=RoleChoices.ADMIN,
        client_id="test-client",
    )

    assert result.created is True
    assert room.get_role(delegate) == RoleChoices.ADMIN
