"""Wip."""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model

import jwt
from rest_framework import authentication, exceptions

User = get_user_model()


logger = logging.getLogger(__name__)


class IntegrationJWTAuthentication(authentication.BaseAuthentication):
    """
    Simple JWT authentication for external-api endpoints.
    """

    def authenticate(self, request):
        """Wip."""

        auth_header = authentication.get_authorization_header(request).split()

        if not auth_header or auth_header[0].lower() != b"bearer":
            return None

        if len(auth_header) != 2:
            logger.error("Invalid token header")
            raise exceptions.AuthenticationFailed("Invalid token header.")

        try:
            token = auth_header[1].decode("utf-8")
        except UnicodeError as e:
            logger.error("Invalid: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e

        return self.authenticate_credentials(token)

    def authenticate_credentials(self, token):
        """Wip."""

        try:
            payload = jwt.decode(
                token,
                settings.INTEGRATIONS_JWT_SECRET_KEY,
                algorithms=[settings.INTEGRATIONS_JWT_ALG],
                issuer=settings.INTEGRATIONS_JWT_ISSUER,
            )
        except jwt.ExpiredSignatureError as e:
            logger.error("Token expired")
            raise exceptions.AuthenticationFailed("Token expired.") from e
        except jwt.InvalidIssuerError as e:
            logger.error("Invalid JWT issuer: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e
        except jwt.InvalidTokenError as e:
            logger.error("Invalid JWT token: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e

        if not payload.get("user_id"):
            logger.warning("Invalid JWT token. Missing 'user_id' in payload")
            return None

        try:
            user = User.objects.get(id=payload["user_id"])
        except User.DoesNotExist as e:
            logger.warning("User not found")
            raise exceptions.AuthenticationFailed("User not found.") from e

        if not user.is_active:
            logger.warning("User inactive")
            raise exceptions.AuthenticationFailed("User inactive.")

        user.token_scopes = payload.get("scope", [])
        user.is_impersonated = payload.get("impersonated", False)
        user.client_id = payload.get("client_id")

        return (user, token)
