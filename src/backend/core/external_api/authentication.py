"""Authentication Backends for external application to the Meet core app."""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import SuspiciousOperation

import jwt as pyJwt
from lasuite.oidc_resource_server.authentication import (
    ResourceServerAuthentication as LaSuiteAuthentication,
)
from lasuite.oidc_resource_server.backend import ResourceServerBackend as LaSuiteBackend
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
            # Defer to next authentication backend
            return None

        if len(auth_header) != 2:
            # Defer to next authentication backend
            return None

        try:
            token = auth_header[1].decode("utf-8")
        except UnicodeError:
            # Defer to next authentication backend
            return None

        return self.authenticate_credentials(token)

    def authenticate_credentials(self, token):
        """Validate JWT token and return authenticated user.

        If token is invalid, defer to next authentication backend.

        Args:
            token: JWT token string

        Returns:
            Tuple of (user, payload)

        Raises:
            AuthenticationFailed: If token is expired, or user not found
        """
        # Decode and validate JWT
        try:
            payload = pyJwt.decode(
                token,
                settings.APPLICATION_JWT_SECRET_KEY,
                algorithms=[settings.APPLICATION_JWT_ALG],
                issuer=settings.APPLICATION_JWT_ISSUER,
                audience=settings.APPLICATION_JWT_AUDIENCE,
            )
        except pyJwt.ExpiredSignatureError as e:
            logger.warning("Token expired")
            raise exceptions.AuthenticationFailed("Token expired.") from e
        except pyJwt.InvalidIssuerError as e:
            logger.warning("Invalid JWT issuer: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e
        except pyJwt.InvalidAudienceError as e:
            logger.warning("Invalid JWT audience: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e
        except pyJwt.InvalidTokenError:
            # Invalid JWT token - defer to next authentication backend
            return None

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


class ResourceServerAuthentication(LaSuiteAuthentication):
    """Custom OIDC Resource Server authentication with token payload extraction."""

    def authenticate(self, request):
        """Authenticate request and extract JWT payload without verification."""

        result = super().authenticate(request)

        if result is None:
            return None

        user, access_token = result

        try:
            token_payload = pyJwt.decode(
                access_token, options={"verify_signature": False}
            )
        except:
            # fixme - not satisfying
            return user, None

        return user, token_payload


class ResourceServerBackend(LaSuiteBackend):
    """OIDC Resource Server backend for user creation and retrieval."""

    # pylint: disable=unused-argument
    def get_or_create_user(self, access_token, id_token, payload):
        """Get or create user from OIDC token claims.

        Despite the LaSuiteBackend's method name suggesting "get_or_create",
        its implementation only performs a GET operation.
        Create new user from the sub claim.

        Args:
            access_token: The access token string
            id_token: The ID token string (unused)
            payload: Token payload dict (unused)

        Returns:
            User instance

        Raises:
            SuspiciousOperation: If user info validation fails
        """

        jwt = self._introspect(access_token)

        try:
            claims = self._verify_claims(jwt)
        except:
            # fixme - not satisfying
            # Token failed verification - could be intended
            # for the service account Authentication.
            return None

        user_info = self._verify_user_info(claims)

        self.token_origin_audience = None  # Reset the token origin audience

        sub = user_info.get("sub")
        if sub is None:
            message = "User info contained no recognizable user identification"
            logger.debug(message)
            raise SuspiciousOperation(message)

        user_info = self._verify_user_info(claims)

        user = self.get_user(sub)
        if user is None:
            user = self.create_user(sub)

        self.token_origin_audience = str(user_info[settings.OIDC_RS_AUDIENCE_CLAIM])

        return user

    def get_user(self, sub):
        """Retrieve user by subject claim.

        Args:
            sub: Subject identifier from token

        Returns:
            User instance or None if not found
        """
        try:
            user = self.UserModel.objects.get(sub=sub)
        except self.UserModel.DoesNotExist:
            logger.debug("Login failed: No user with %s found", sub)
            return None

        return user

    def create_user(self, sub):
        """Create new user from subject claim.

        Args:
            sub: Subject identifier from token

        Returns:
            Newly created User instance
        """
        user = self.UserModel(sub=sub)
        user.set_unusable_password()
        user.save()

        return user
