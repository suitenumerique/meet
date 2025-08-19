"""Authentication class for storage event token validation."""

import logging
import secrets

from django.conf import settings

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

logger = logging.getLogger(__name__)


class MachineUser:
    """Represent a non-interactive system user for automated storage operations."""

    def __init__(self) -> None:
        self.pk = None
        self.username = "storage_event_user"
        self.is_active = True

    @property
    def is_authenticated(self):
        """Indicate if this machine user is authenticated."""
        return True

    @property
    def is_anonymous(self) -> bool:
        """Indicate if this is an anonymous user."""
        return False

    def get_username(self) -> str:
        """Return the machine user identifier."""
        return self.username


class StorageEventAuthentication(BaseAuthentication):
    """Authenticate requests using a Bearer token for storage event integration.
    This class validates Bearer tokens for storage events that don't map to database users.
    It's designed for S3-compatible storage integrations and similar use cases.
    Events are submitted when a webhook is configured on some bucket's events.
    """

    AUTH_HEADER = "Authorization"
    TOKEN_TYPE = "Bearer"  # noqa S105

    def authenticate(self, request):
        """Validate the Bearer token from the Authorization header."""

        if not settings.RECORDING_ENABLE_STORAGE_EVENT_AUTH:
            return MachineUser(), None

        required_token = settings.RECORDING_STORAGE_EVENT_TOKEN
        if not required_token:
            if settings.RECORDING_ENABLE_STORAGE_EVENT_AUTH:
                raise AuthenticationFailed(
                    "Authentication is enabled but token is not configured."
                )

            return MachineUser(), None

        auth_header = request.headers.get(self.AUTH_HEADER)

        if not auth_header:
            logger.warning(
                "Authentication failed: Missing Authorization header (ip: %s)",
                request.META.get("REMOTE_ADDR"),
            )
            raise AuthenticationFailed("Authorization header is required")

        auth_parts = auth_header.split(" ")
        if len(auth_parts) != 2 or auth_parts[0] != self.TOKEN_TYPE:
            logger.warning(
                "Authentication failed: Invalid authorization header (ip: %s)",
                request.META.get("REMOTE_ADDR"),
            )
            raise AuthenticationFailed("Invalid authorization header.")

        token = auth_parts[1]

        # Use constant-time comparison to prevent timing attacks
        if not secrets.compare_digest(token.encode(), required_token.encode()):
            logger.warning(
                "Authentication failed: Invalid token (ip: %s)",
                request.META.get("REMOTE_ADDR"),
            )
            raise AuthenticationFailed("Invalid token")

        return MachineUser(), token

    def authenticate_header(self, request):
        """Return the WWW-Authenticate header value."""
        return f"{self.TOKEN_TYPE} realm='Storage event API'"
