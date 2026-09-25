"""Authentication classes for server-to-server webhook token validation."""

import logging
import secrets

from django.conf import settings

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

logger = logging.getLogger(__name__)


class MachineUser:
    """Represent a non-interactive system user for automated operations."""

    def __init__(self, username: str = "machine_user") -> None:
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

    EXPECTED_TOKEN_SETTINGS_KEY = None

    def authenticate(self, request):
        """Validate the Bearer token from the Authorization header."""

        if (
            self.EXPECTED_TOKEN_SETTINGS_KEY is None
            or (required_token := getattr(settings, self.EXPECTED_TOKEN_SETTINGS_KEY))
            is None
        ):
            raise AuthenticationFailed("Authentication token is not configured.")

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


class RecordingProcessWebhookAuthentication(HeaderBasedAuthentication):
    """
    Custom authentication class for recording process webhook requests.
    Validates the API key in the Authorization header.
    """

    REALM = "External process webhook API"
    EXPECTED_TOKEN_SETTINGS_KEY = "SUMMARY_SERVICE_WEBHOOK_API_TOKEN"  # noqa S105
