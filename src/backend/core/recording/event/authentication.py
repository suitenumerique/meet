"""Authentication class for storage event token validation."""

import logging
import secrets

from django.conf import settings

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

logger = logging.getLogger(__name__)


class MachineUser:
    """Represent a non-interactive system user for automated storage operations."""

    def __init__(self, username: str = "storage_event_user") -> None:
        self.pk = None
        self.username = username
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


class HeaderBasedAuthentication(BaseAuthentication):
    """Authenticate requests using a header with a secret key."""

    AUTH_HEADER = "Authorization"
    TOKEN_TYPE = "Bearer"  # noqa S105
    REALM = ""

    IS_ENFORCED_SETTINGS_KEY = None
    EXPECTED_TOKEN_SETTINGS_KEY = None

    def authenticate(self, request):
        """Validate the Bearer token from the Authorization header."""

        if self.IS_ENFORCED_SETTINGS_KEY is not None:
            if not getattr(settings, self.IS_ENFORCED_SETTINGS_KEY):
                return MachineUser(), None

        if (
            self.EXPECTED_TOKEN_SETTINGS_KEY is None
            or (required_token := getattr(settings, self.EXPECTED_TOKEN_SETTINGS_KEY))
            is None
        ):
            raise AuthenticationFailed(
                "Authentication is enabled but token is not configured."
            )

        auth_header = request.headers.get(self.AUTH_HEADER)
        if not auth_header:
            logger.warning(
                "Authentication failed: Missing Authorization header (ip: %s)",
                request.META.get("REMOTE_ADDR"),
            )
            raise AuthenticationFailed("Authorization header is required")

        scheme, _, token = auth_header.partition(" ")
        if scheme.lower() != self.TOKEN_TYPE.lower() or not token.strip():
            raise AuthenticationFailed("Invalid authorization header format.")
        token = token.strip()

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
        return f"{self.TOKEN_TYPE} realm='{self.REALM}'"


class StorageEventAuthentication(HeaderBasedAuthentication):
    """Authenticate requests using a Bearer token for storage event integration.
    This class validates Bearer tokens for storage events that don't map to database users.
    It's designed for S3-compatible storage integrations and similar use cases.
    Events are submitted when a webhook is configured on some bucket's events.
    """

    REALM = "Storage event API"
    IS_ENFORCED_SETTINGS_KEY = "RECORDING_ENABLE_STORAGE_EVENT_AUTH"
    EXPECTED_TOKEN_SETTINGS_KEY = "RECORDING_STORAGE_EVENT_TOKEN"  # noqa S105


class RecordingProcessWebhookAuthentication(HeaderBasedAuthentication):
    """
    Custom authentication class for recording process webhook requests.
    Validates the API key in the Authorization header.
    """

    REALM = "External process webhook API"
    EXPECTED_TOKEN_SETTINGS_KEY = "SUMMARY_SERVICE_WEBHOOK_API_TOKEN"  # noqa S105
