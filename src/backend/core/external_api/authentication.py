"""Authentication Backends for service accounts integrated to the Meet core app."""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model

import jwt
from rest_framework import authentication, exceptions

User = get_user_model()


logger = logging.getLogger(__name__)


class ServiceAccountJWTAuthentication(authentication.BaseAuthentication):
    """JWT authentication for external API endpoints."""

    def authenticate(self, request):
        """Extract and validate JWT from Authorization header."""

        auth_header = authentication.get_authorization_header(request).split()

        if not auth_header or auth_header[0].lower() != b"bearer":
            return None

        if len(auth_header) != 2:
            logger.warning("Invalid token header")
            raise exceptions.AuthenticationFailed("Invalid token header.")

        try:
            token = auth_header[1].decode("utf-8")
        except UnicodeError as e:
            logger.warning("Invalid: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e

        return self.authenticate_credentials(token)

    def authenticate_credentials(self, token):
        """Authenticate and validate JWT token credentials."""

        try:
            payload = jwt.decode(
                token,
                settings.INTEGRATIONS_JWT_SECRET_KEY,
                algorithms=[settings.INTEGRATIONS_JWT_ALG],
                issuer=settings.INTEGRATIONS_JWT_ISSUER,
            )
        except jwt.ExpiredSignatureError as e:
            logger.warning("Token expired")
            raise exceptions.AuthenticationFailed("Token expired.") from e
        except jwt.InvalidIssuerError as e:
            logger.warning("Invalid JWT issuer: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e
        except jwt.InvalidTokenError as e:
            logger.warning("Invalid JWT token: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e

        user_id = payload.get("user_id")
        if not user_id:
            logger.warning("Missing 'user_id' in JWT payload")
            raise exceptions.AuthenticationFailed("Invalid token.")

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist as e:
            logger.warning("User not found: %s", user_id)
            raise exceptions.AuthenticationFailed("Invalid token.") from e

        if not user.is_active:
            logger.warning("Inactive user attempted authentication: %s", user_id)
            raise exceptions.AuthenticationFailed("Account disabled.")

        # Attach token metadata to user
        user.token_scopes = payload.get("scope", [])
        user.is_impersonated = payload.get("impersonated", False)
        user.client_id = payload.get("client_id")

        return (user, token)
