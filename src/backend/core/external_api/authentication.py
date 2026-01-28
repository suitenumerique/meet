"""Authentication Backends for external application to the Meet core app."""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import SuspiciousOperation

import jwt as pyJwt
from lasuite.oidc_resource_server.backend import ResourceServerBackend as LaSuiteBackend
from rest_framework import authentication, exceptions

User = get_user_model()
logger = logging.getLogger(__name__)


class BaseJWTAuthentication(authentication.BaseAuthentication):
    """Base JWT authentication class."""

    secret_key = None
    algorithm = None
    issuer = None
    audience = None

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
            logger.warning("Invalid token header format")
            raise exceptions.AuthenticationFailed("Invalid token header.")

        try:
            token = auth_header[1].decode("utf-8")
        except UnicodeError as e:
            logger.warning("Token decode error: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token encoding.") from e

        return self.authenticate_credentials(token)

    def decode_jwt(self, token):
        """Decode and validate JWT token.

        Args:
            token: JWT token string

        Returns:
            Decoded payload dict, or None if token is invalid

        Raises:
            AuthenticationFailed: If token is expired or has invalid issuer/audience
        """

        try:
            payload = pyJwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                issuer=self.issuer,
                audience=self.audience,
            )
            return payload
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

    def validate_payload(self, payload):
        """Validate JWT payload claims.

        Override in subclasses to add custom validation.

        Args:
            payload: Decoded JWT payload

        Raises:
            AuthenticationFailed: If required claims are missing or invalid
        """

    def get_user(self, payload):
        """Retrieve and validate user from payload.

        Args:
            payload: Decoded JWT payload

        Returns:
            User instance

        Raises:
            AuthenticationFailed: If user not found or inactive
        """
        user_id = payload.get("user_id")

        if not user_id:
            logger.warning("Missing 'user_id' in JWT payload")
            raise exceptions.AuthenticationFailed("Invalid token claims.")

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist as e:
            logger.warning("User not found: %s", user_id)
            raise exceptions.AuthenticationFailed("User not found.") from e

        if not user.is_active:
            logger.warning("Inactive user attempted authentication: %s", user_id)
            raise exceptions.AuthenticationFailed("User account is disabled.")

        return user

    def authenticate_header(self, request):
        """Return authentication scheme for WWW-Authenticate header."""
        return "Bearer"

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

        payload = self.decode_jwt(token)

        if payload is None:
            return None

        self.validate_payload(payload)
        user = self.get_user(payload)

        return (user, payload)


class ApplicationJWTAuthentication(BaseJWTAuthentication):
    """JWT authentication for application-delegated API access.

    Validates JWT tokens issued to applications that are acting on behalf
    of users. Tokens must include user_id, client_id, and delegation flag.
    """

    secret_key = settings.APPLICATION_JWT_SECRET_KEY
    algorithm = settings.APPLICATION_JWT_ALG
    issuer = settings.APPLICATION_JWT_ISSUER
    audience = settings.APPLICATION_JWT_AUDIENCE

    def validate_payload(self, payload):
        """Validate application-specific claims."""
        client_id = payload.get("client_id")
        is_delegated = payload.get("delegated", False)

        if not client_id:
            logger.warning("Missing 'client_id' in JWT payload")
            raise exceptions.AuthenticationFailed("Invalid token claims.")

        if not is_delegated:
            logger.warning("Token is not marked as delegated")
            raise exceptions.AuthenticationFailed("Invalid token type.")


class AddonsJWTAuthentication(BaseJWTAuthentication):
    """JWT authentication for addons API access.

    Validates JWT tokens issued by addons for authenticating users.
    Tokens must include user_id to identify the authenticated user.
    """

    secret_key = settings.ADDONS_JWT_SECRET_KEY
    algorithm = settings.ADDONS_JWT_ALG
    issuer = settings.ADDONS_JWT_ISSUER
    audience = settings.ADDONS_JWT_AUDIENCE


class ResourceServerBackend(LaSuiteBackend):
    """OIDC Resource Server backend for user creation and retrieval."""

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

        sub = payload.get("sub")

        if sub is None:
            message = "User info contained no recognizable user identification"
            logger.debug(message)
            raise SuspiciousOperation(message)

        user = self.get_user(access_token, id_token, payload)

        if user is None and settings.OIDC_CREATE_USER:
            user = self.create_user(sub)

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
