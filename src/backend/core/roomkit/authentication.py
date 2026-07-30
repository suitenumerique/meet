"""Authentication for the roomkit API of the Meet core app."""

import logging
import secrets

from django.conf import settings

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from core.recording.event.authentication import MachineUser

logger = logging.getLogger(__name__)


class ServerToServerAuthentication(BaseAuthentication):
    """Custom authentication class for roomkit server-to-server requests.

    Validates the Authorization header against the roomkit server-to-server
    token. A valid PIN code is intentionally not enough to authenticate: the
    endpoints are restricted to the LiveKit SIP module's credentials.
    """

    AUTH_HEADER = "Authorization"
    TOKEN_TYPE = "Bearer"  # noqa S105

    def authenticate(self, request):
        """Validate the Bearer token from the Authorization header.

        Returns a (MachineUser, token) pair on success, and raises
        AuthenticationFailed if the header is missing, malformed, or contains
        an invalid token.
        """
        required_token = settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN
        if not required_token:
            raise AuthenticationFailed("Server-to-server token is not configured.")

        auth_header = request.headers.get(self.AUTH_HEADER)
        if not auth_header:
            logger.warning(
                "Roomkit authentication failed: missing Authorization header (ip: %s)",
                request.META.get("REMOTE_ADDR"),
            )
            raise AuthenticationFailed("Authorization header is missing.")

        # Validate token format and existence
        auth_parts = auth_header.split(" ")
        if len(auth_parts) != 2 or auth_parts[0] != self.TOKEN_TYPE:
            raise AuthenticationFailed("Invalid authorization header.")

        token = auth_parts[1]

        # Use constant-time comparison to prevent timing attacks
        if not secrets.compare_digest(token.encode(), required_token.encode()):
            logger.warning(
                "Roomkit authentication failed: invalid token (ip: %s)",
                request.META.get("REMOTE_ADDR"),
            )
            raise AuthenticationFailed("Invalid server-to-server token.")

        return MachineUser(username="roomkit"), token

    def authenticate_header(self, request):
        """Return the WWW-Authenticate header value."""
        return f"{self.TOKEN_TYPE} realm='Roomkit server to server'"
