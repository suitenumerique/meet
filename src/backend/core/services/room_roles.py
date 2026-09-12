"""Room role management service.

Single entry point for changing a user's role on a room, used by:
- the in-meeting endpoint (promote/demote a connected participant)
- the external API grant-access endpoint (delegate access by email)

`ResourceAccess` is the source of truth. The LiveKit `room_role`
participant attribute is only a projection of it, synced best-effort.
"""

from dataclasses import dataclass
from logging import getLogger
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import IntegrityError

from core import models
from core.services.participants_management import (
    ParticipantNotFoundException,
    ParticipantsManagement,
    ParticipantsManagementException,
)
from core.services.provisional_user_service import ProvisionalUserService

logger = getLogger(__name__)


class RoomRoleError(Exception):
    """Base exception for room role management errors."""

    status_code = 400


class SelfActionError(RoomRoleError):
    """Raised when a user tries to change their own role."""

    status_code = 403


class OwnerRoleError(RoomRoleError):
    """Raised when trying to demote an owner or grant ownership."""

    status_code = 403


class ParticipantNotInMeetingError(RoomRoleError):
    """Raised when the target participant is not connected to the meeting."""

    status_code = 404


class UserNotFoundError(RoomRoleError):
    """Raised when the target participant has no user account in database."""

    status_code = 404


ASSIGNABLE_ROLES = (models.RoleChoices.MEMBER, models.RoleChoices.ADMIN)


@dataclass
class GrantAccessResult:
    """Outcome of `RoomRoleService.grant_access_by_email`."""

    email: str
    role: str
    created: bool
    provisional_user_created: bool
    detail: str | None = None

    def to_payload(self):
        """Serialize to the API response payload."""
        payload = {
            "email": self.email,
            "role": self.role,
            "created": self.created,
            "provisional_user_created": self.provisional_user_created,
        }
        if self.detail:
            payload["detail"] = self.detail
        return payload


class RoomRoleService:
    """Manage promotion and demotion of room co-hosts."""

    def set_role(
        self, room: models.Room, user: models.User, role: str, actor: models.User
    ):
        """Persist `role` for `user` on `room`, idempotently and atomically.

        Returns the up-to-date `ResourceAccess`. Never grants or removes
        ownership: granting OWNER is refused, and an existing OWNER access
        is never modified.
        """

        if role not in ASSIGNABLE_ROLES:
            raise OwnerRoleError("Ownership cannot be granted through this action.")

        if actor is not None and user == actor:
            raise SelfActionError("You cannot change your own role.")

        access, created = models.ResourceAccess.objects.get_or_create(
            resource=room,
            user=user,
            defaults={"role": role},
        )

        if created:
            return access

        if access.role == models.RoleChoices.OWNER:
            raise OwnerRoleError("Room owners cannot be demoted.")

        if access.role != role:
            access.role = role
            access.save(update_fields=["role", "updated_at"])

        return access

    def set_participant_role(
        self,
        room: models.Room,
        participant_identity: UUID,
        role: str,
        actor: models.User,
    ):
        """Change the role of a participant currently connected to the meeting.

        - The participant must be connected (checked against LiveKit).
        - The participant must map to a user account.
        - The role is persisted in DB then mirrored to LiveKit.

        Returns a dict: {"role", "livekit_synced"}.
        """

        room_name = str(room.pk)
        participants_management = ParticipantsManagement()

        try:
            is_in_meeting = participants_management.check_if_in_meeting(
                room_name=room_name, identity=str(participant_identity)
            )
        except ParticipantNotFoundException as e:
            raise ParticipantNotInMeetingError(
                "Participant is not connected to this meeting."
            ) from e

        if not is_in_meeting:
            raise ParticipantNotInMeetingError(
                "Participant is not connected to this meeting."
            )

        user = models.User.objects.filter(sub=participant_identity).first()

        if user is None:
            raise UserNotFoundError(
                "This participant has no user account and cannot be assigned a role."
            )

        # Source of truth first: even if the LiveKit sync below fails,
        # the role is real and any fresh token will carry it.
        self.set_role(room=room, user=user, role=role, actor=actor)

        livekit_synced = self._sync_livekit_role(
            room_name=room_name,
            participant_identity=str(participant_identity),
            role=str(role),
        )

        return {
            "role": role,
            "livekit_synced": livekit_synced,
        }

    def grant_access_by_email(  # pylint: disable=too-many-arguments,too-many-positional-arguments
        self,
        room: models.Room,
        actor: models.User,
        email: str,
        role: str,
        client_id: str,
    ) -> GrantAccessResult:
        """Grant `role` on `room` to the user identified by `email`.

        If no account matches the email, a provisional user is created when
        the configuration allows it (claimed on the delegate's first OIDC
        login). The operation is idempotent and race-safe: concurrent grants
        for the same (room, user) pair resolve on the unique constraint. An
        existing owner is never demoted. When the role is effectively granted
        or updated and the delegate is currently connected to the meeting,
        the new role is mirrored to LiveKit, best-effort.

        Returns a `GrantAccessResult`.
        """
        delegate, provisional_user_created = ProvisionalUserService().get_or_create(
            email, client_id
        )

        if delegate == actor:
            raise SelfActionError("You cannot change your own access on a room.")

        # `get_or_create` keeps the operation race-safe: concurrent requests for
        # the same (resource, user) pair resolve on the unique constraint
        # instead of failing. Note that `BaseModel.save` runs `full_clean`, so
        # the race can surface as a `ValidationError` (from `validate_unique`)
        # before the database unique constraint is even hit. In both cases,
        # fetch the access created by the concurrent request.
        try:
            access, created = models.ResourceAccess.objects.get_or_create(
                resource=room,
                user=delegate,
                defaults={"role": role},
            )
        except (IntegrityError, ValidationError):
            access = models.ResourceAccess.objects.get(resource=room, user=delegate)
            created = False

        detail = None
        role_changed = created
        if not created:
            if access.role == models.RoleChoices.OWNER:
                # An existing owner is never demoted.
                detail = "Delegate is already owner of this room."
            elif access.role != role:
                access.role = role
                access.save(update_fields=["role", "updated_at"])
                role_changed = True

        if role_changed:
            self._sync_livekit_role_if_connected(
                room=room, user=delegate, role=access.role
            )

        return GrantAccessResult(
            email=email,
            role=access.role,
            created=created,
            provisional_user_created=provisional_user_created,
            detail=detail,
        )

    def _sync_livekit_role_if_connected(
        self, room: models.Room, user: models.User, role: str
    ):
        """Mirror `role` to LiveKit if `user` is currently in the meeting.

        Connected participants carry their role in a LiveKit attribute, so a
        role change must be pushed to them; participants not in the meeting
        (the nominal case: access is granted before it starts) will get a
        fresh token carrying the role on their next join.

        Fully best-effort: any failure is logged and swallowed, the database
        role stays authoritative.
        """
        if user.sub is None:
            # Provisional users have no LiveKit identity yet.
            return

        room_name = str(room.pk)
        identity = str(user.sub)

        try:
            is_in_meeting = ParticipantsManagement().check_if_in_meeting(
                room_name=room_name, identity=identity
            )
        except ParticipantNotFoundException:
            return
        except Exception:  # pylint: disable=broad-exception-caught
            logger.exception(
                "Could not check participant %s presence in room %s",
                identity,
                room_name,
            )
            return

        if not is_in_meeting:
            return

        self._sync_livekit_role(
            room_name=room_name,
            participant_identity=identity,
            role=str(role),
        )

    @staticmethod
    def _sync_livekit_role(room_name: str, participant_identity: str, role: str):
        """Mirror the role to the participant's LiveKit attributes.

        Best-effort: returns False on failure instead of raising, so callers
        can report a partial success. Re-running the action re-syncs.
        """
        try:
            ParticipantsManagement().update(
                room_name=room_name,
                identity=participant_identity,
                attributes={"room_role": role},
            )
        except ParticipantNotFoundException:
            # The participant left between the presence check and the update:
            # harmless, the DB state (if any) remains authoritative.
            logger.info(
                "Participant %s left room %s before role sync",
                participant_identity,
                room_name,
            )
            return False
        except ParticipantsManagementException:
            logger.exception(
                "Could not sync role to LiveKit for participant %s in room %s",
                participant_identity,
                room_name,
            )
            return False
        return True
