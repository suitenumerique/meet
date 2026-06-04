"""Service for provisional user creation."""

import logging

from django.conf import settings
from django.core.exceptions import SuspiciousOperation, ValidationError
from django.db import IntegrityError

from core import models

logger = logging.getLogger(__name__)


class ProvisionalUserError(Exception):
    """Base exception for provisional user service errors."""


class ProvisionalUserCreationDisabledError(ProvisionalUserError):
    """Raised when provisional user creation is disabled by configuration."""


class ProvisionalUserIntegrityError(ProvisionalUserError):
    """Raised when a provisional user cannot be created or retrieved after a race condition."""


class ProvisionalUserService:
    """Handles creation and retrieval of provisional users.

    A provisional user is created without a `sub`, identified by email only.
    The `sub` is set on first successful OIDC authentication via Django LaSuite.
    """

    def __init__(self):
        """Initialize the service."""

        # `OIDC_USER_SUB_FIELD_IMMUTABLE` comes from Django LaSuite and prevents `sub`
        # updates. We override its default value to allow setting `sub` for
        # provisional users.

        self._is_creation_enabled = (
            settings.APPLICATION_ALLOW_USER_CREATION
            and settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION
            and not settings.OIDC_USER_SUB_FIELD_IMMUTABLE
        )

    def _get_by_email(self, email: str) -> models.User | None:
        """Return the user with this email, or None if not found."""
        try:
            return models.User.objects.get(email__iexact=email)
        except models.User.DoesNotExist:
            return None
        except models.User.MultipleObjectsReturned as e:
            raise SuspiciousOperation(
                "Multiple user accounts share a common email."
            ) from e

    def get_or_create(
        self, email: str, client_id: str
    ) -> tuple[models.User | None, bool]:
        """Get or create a provisional user identified by email.

        Args:
            email: The email address to identify the user.
            client_id: The application client_id, used for audit logging only.

        Returns:
            A (user, created) tuple — mirrors get_or_create conventions.

        Raises:
            ProvisionalUserError: If creation and retrieval both fail.
        """
        user = self._get_by_email(email)
        if user:
            return user, False

        if not self._is_creation_enabled:
            raise ProvisionalUserCreationDisabledError(
                "Provisional user creation is disabled by configuration."
            )

        # Create a provisional user without `sub`, identified by email only.
        # This relies on Django LaSuite implicitly updating the `sub` field on the
        # user's first successful OIDC authentication. If this stops working,
        # check for behavior changes in Django LaSuite.
        try:
            user = models.User(sub=None, email=email)
            user.set_unusable_password()
            user.save()
            logger.info(
                "Provisional user created via application: user_id=%s, email=%s, client_id=%s",
                user.id,
                email,
                client_id,
            )
            return user, True
        except (IntegrityError, ValidationError) as e:
            logger.warning(
                "Race condition on provisional user creation, fetching existing: "
                "email=%s, client_id=%s",
                email,
                client_id,
            )
            user = self._get_by_email(email)

            if user:
                return user, False

            raise ProvisionalUserIntegrityError(
                "Failed to create or retrieve provisional user."
            ) from e
