"""Participant promotion service."""

from logging import getLogger

from core import models

logger = getLogger(__name__)


class PromotionException(Exception):
    """Base exception for promotion errors."""


class OwnerPromotionException(PromotionException):
    """Raised when attempting to promote an owner."""


class AlreadyAdminException(PromotionException):
    """Raised when attempting to promote a user who is already an admin."""


class ParticipantPromotionService:
    """Handles the DB side of promoting a participant to room admin."""

    def promote_to_admin(self, room, user) -> None:
        """Promote a user to ADMIN role for the given room."""

        access = models.ResourceAccess.objects.filter(resource=room, user=user).first()

        if access and access.role == models.RoleChoices.ADMIN:
            raise AlreadyAdminException(
                f"User {user.pk} is already an admin of room {room.pk}"
            )

        if access and access.role == models.RoleChoices.OWNER:
            raise OwnerPromotionException(
                f"User {user.pk} is an owner of room {room.pk} and cannot be promoted"
            )

        models.ResourceAccess.objects.update_or_create(
            resource=room,
            user=user,
            defaults={"role": models.RoleChoices.ADMIN},
        )
