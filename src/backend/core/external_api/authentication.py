"""Wip."""

import logging
import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
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

        if not auth_header or auth_header[0].lower() != b'bearer':
            return None

        if len(auth_header) != 2:
            raise exceptions.AuthenticationFailed('Invalid token header.')

        try:
            token = auth_header[1].decode('utf-8')
        except UnicodeError:
            raise exceptions.AuthenticationFailed('Invalid token.')

        return self.authenticate_credentials(token)

    def authenticate_credentials(self, token):
        """Wip."""

        try:
            payload = jwt.decode(
                token,
                settings.INTEGRATIONS_JWT_SECRET_KEY,
                algorithms=[settings.INTEGRATIONS_JWT_ALG],
                audience="wip"
            )
        except jwt.ExpiredSignatureError:
            logger.error("Token expired")
            raise exceptions.AuthenticationFailed('Token expired.')
        except jwt.InvalidTokenError as e:
            logger.error("Invalid JWT token: %s", e)
            raise exceptions.AuthenticationFailed('Invalid token.')

        if not payload.get("user_id"):
            logger.warning("Invalid JWT token. Missing 'user_id' in payload")
            return None

        try:
            user = User.objects.get(id=payload['user_id'])
        except User.DoesNotExist:
            logger.warning("User not found")
            raise exceptions.AuthenticationFailed('User not found.')

        if not user.is_active:
            logger.warning("User inactive")
            raise exceptions.AuthenticationFailed('User inactive.')
        return (user, token)