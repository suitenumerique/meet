"""Authentication Backends for external application to the Meet core app."""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model

import jwt
from rest_framework import authentication, exceptions

User = get_user_model()
logger = logging.getLogger(__name__)


class ApplicationJWTAuthentication(authentication.BaseAuthentication):
    """JWT authentication for application-delegated API access.

    Validates JWT tokens issued to applications that are acting on behalf
    of users. Tokens must include user_id, client_id, and delegation flag.
    """

    def authenticate(self, request):
        """Extract and validate JWT from Authorization header.

        Returns:
            Tuple of (user, payload) if authentication successful, None otherwise
        """
        auth_header = authentication.get_authorization_header(request).split()

        if not auth_header or auth_header[0].lower() != b"bearer":
            return None

        if len(auth_header) != 2:
            logger.warning("Invalid token header format")
            raise exceptions.AuthenticationFailed("Invalid token header.")

        try:
            token = auth_header[1].decode("utf-8")
        except UnicodeError as e:
            logger.warning("Token decode error: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token encoding.") from e

        return self.authenticate_credentials(token)

    def authenticate_credentials(self, token):
        """Validate JWT token and return authenticated user.

        Args:
            token: JWT token string

        Returns:
            Tuple of (user, payload)

        Raises:
            AuthenticationFailed: If token is invalid, expired, or user not found
        """
        # Decode and validate JWT
        try:
            payload = jwt.decode(
                token,
                settings.APPLICATION_JWT_SECRET_KEY,
                algorithms=[settings.APPLICATION_JWT_ALG],
                issuer=settings.APPLICATION_JWT_ISSUER,
                audience=settings.APPLICATION_JWT_AUDIENCE,
            )
        except jwt.ExpiredSignatureError as e:
            logger.warning("Token expired")
            raise exceptions.AuthenticationFailed("Token expired.") from e
        except jwt.InvalidIssuerError as e:
            logger.warning("Invalid JWT issuer: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e
        except jwt.InvalidAudienceError as e:
            logger.warning("Invalid JWT audience: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e
        except jwt.InvalidTokenError as e:
            logger.warning("Invalid JWT token: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e

        user_id = payload.get("user_id")
        client_id = payload.get("client_id")
        is_delegated = payload.get("delegated", False)

        if not user_id:
            logger.warning("Missing 'user_id' in JWT payload")
            raise exceptions.AuthenticationFailed("Invalid token claims.")

        if not client_id:
            logger.warning("Missing 'client_id' in JWT payload")
            raise exceptions.AuthenticationFailed("Invalid token claims.")

        if not is_delegated:
            logger.warning("Token is not marked as delegated")
            raise exceptions.AuthenticationFailed("Invalid token type.")

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist as e:
            logger.warning("User not found: %s", user_id)
            raise exceptions.AuthenticationFailed("User not found.") from e

        if not user.is_active:
            logger.warning("Inactive user attempted authentication: %s", user_id)
            raise exceptions.AuthenticationFailed("User account is disabled.")

        return (user, payload)

    def authenticate_header(self, request):
        """Return authentication scheme for WWW-Authenticate header."""
        return "Bearer"
