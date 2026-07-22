"""Room role management service.

Single entry point for changing a user's role on a room, used by:
- the in-meeting endpoint (promote/demote a connected participant)
- (more to come soon)

`ResourceAccess` is the source of truth. The LiveKit `room_admin`
participant attribute is only a projection of it, synced best-effort.
"""

from logging import getLogger
from uuid import UUID

from core import models
from core.services.participants_management import (
    ParticipantNotFoundException,
    ParticipantsManagement,
    ParticipantsManagementException,
)

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
            is_admin=role == models.RoleChoices.ADMIN,
        )

        return {
            "role": role,
            "livekit_synced": livekit_synced,
        }

    @staticmethod
    def _sync_livekit_role(room_name: str, participant_identity: str, is_admin: bool):
        """Mirror the role to the participant's LiveKit attributes.

        Best-effort: returns False on failure instead of raising, so callers
        can report a partial success. Re-running the action re-syncs.
        """
        try:
            ParticipantsManagement().update(
                room_name=room_name,
                identity=participant_identity,
                attributes={"room_admin": "true" if is_admin else "false"},
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
