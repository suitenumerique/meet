"""Authentication Backends for external application to the Meet core app."""

# pylint: disable=R0913,R0917
# ruff: noqa: PLR0913

import logging
from dataclasses import asdict

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import SuspiciousOperation

import requests
from lasuite.oidc_resource_server.backend import ResourceServerBackend as LaSuiteBackend
from menshen_client import Configuration, IntrospectionRequest, TokenExchangeClient
from menshen_client.exceptions import ResponseParsingError
from rest_framework import authentication, exceptions

from core.models import Application, ApplicationScope
from core.services import jwt_token

User = get_user_model()
logger = logging.getLogger(__name__)


def get_bearer_token(request):
    """Extract the bearer token from the Authorization header.

    Returns:
        Token string, or None if the request carries no bearer token

    Raises:
        AuthenticationFailed: If the Authorization header is malformed
    """

    auth_header = authentication.get_authorization_header(request).split()

    if not auth_header or auth_header[0].lower() != b"bearer":
        return None

    if len(auth_header) != 2:
        logger.warning("Invalid token header format")
        raise exceptions.AuthenticationFailed("Invalid token header.")

    try:
        return auth_header[1].decode("utf-8")
    except UnicodeError as e:
        logger.warning("Token decode error: %s", e)
        raise exceptions.AuthenticationFailed("Invalid token encoding.") from e


class BaseJWTAuthentication(authentication.BaseAuthentication):
    """Base JWT authentication class."""

    def __init__(  # noqa: PLR0917
        self,
        secret_key,
        algorithm,
        issuer,
        audience,
        expiration_seconds,
        token_type,
        is_enabled,
    ):
        """Initialize the JWT authentication backend with the given token service configuration.

        Args:
            secret_key: Secret key for JWT encoding/decoding
            algorithm: JWT algorithm (e.g. HS256)
            issuer: Expected token issuer identifier
            audience: Expected token audience identifier
            expiration_seconds: Token expiration time in seconds
            token_type: Token type (e.g. Bearer)
            is_enabled: Whether this authentication backend is active
        """

        super().__init__()

        self.is_enabled = is_enabled
        self._token_service = None

        if not self.is_enabled:
            return

        self._token_service = jwt_token.JwtTokenService(
            secret_key=secret_key,
            algorithm=algorithm,
            issuer=issuer,
            audience=audience,
            expiration_seconds=expiration_seconds,
            token_type=token_type,
        )

    def authenticate(self, request):
        """Extract and validate JWT from Authorization header.

        Returns:
            Tuple of (user, payload) if authentication successful, None otherwise
        """

        if not self.is_enabled:
            return None

        token = get_bearer_token(request)

        if token is None:
            # Defer to next authentication backend
            return None

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
            payload = self._token_service.decode_jwt(token)
            return payload
        except jwt_token.TokenExpiredError as e:
            logger.warning("Token expired")
            raise exceptions.AuthenticationFailed("Token expired.") from e
        except jwt_token.TokenInvalidError as e:
            logger.warning("Invalid JWT issuer or audience: %s", e)
            raise exceptions.AuthenticationFailed("Invalid token.") from e
        except jwt_token.TokenDecodeError:
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

    def __init__(self):
        """Initialize authentication backend with application JWT settings from Django settings."""
        super().__init__(
            secret_key=settings.APPLICATION_JWT_SECRET_KEY,
            algorithm=settings.APPLICATION_JWT_ALG,
            issuer=settings.APPLICATION_JWT_ISSUER,
            audience=settings.APPLICATION_JWT_AUDIENCE,
            expiration_seconds=settings.APPLICATION_JWT_EXPIRATION_SECONDS,
            token_type=settings.APPLICATION_JWT_TOKEN_TYPE,
            is_enabled=settings.APPLICATION_ENABLED,
        )

    def validate_payload(self, payload):
        """Validate application-specific claims."""
        client_id = payload.get("client_id")
        is_delegated = payload.get("delegated", False)

        if not client_id:
            logger.warning("Missing 'client_id' in JWT payload")
            raise exceptions.AuthenticationFailed("Invalid token claims.")

        try:
            application = Application.objects.get(client_id=client_id)
        except Application.DoesNotExist as e:
            logger.warning("Application not found: %s", client_id)
            raise exceptions.AuthenticationFailed("Application not found.") from e

        if not application.is_active:
            logger.warning(
                "Inactive application attempted authentication: %s", client_id
            )
            raise exceptions.AuthenticationFailed("Application is disabled.")

        if not is_delegated:
            logger.warning("Token is not marked as delegated")
            raise exceptions.AuthenticationFailed("Invalid token type.")


class AddonsJWTAuthentication(BaseJWTAuthentication):
    """JWT authentication for addons API access.

    Validates JWT tokens issued to addons.
    """

    def __init__(self):
        """Initialize authentication backend with addons JWT settings from Django settings."""

        super().__init__(
            secret_key=settings.ADDONS_TOKEN_SECRET_KEY,
            algorithm=settings.ADDONS_TOKEN_ALG,
            issuer=settings.ADDONS_TOKEN_ISSUER,
            audience=settings.ADDONS_TOKEN_AUDIENCE,
            expiration_seconds=settings.ADDONS_TOKEN_TTL,
            token_type=settings.ADDONS_TOKEN_TYPE,
            is_enabled=settings.ADDONS_ENABLED,
        )


# Menshen grants scopes following La Suite's "service:resource:action" convention.
# Map them to the scopes expected by the external API permissions.
MENSHEN_SCOPES_MAPPING = {
    "meet:room:create": ApplicationScope.ROOMS_CREATE,
}


class MenshenAuthentication(authentication.BaseAuthentication):
    """Authentication for tokens exchanged through Menshen.

    Menshen is La Suite's OAuth 2.0 token exchange server (RFC 8693): another service
    exchanges its user's access token for a token targeting Meet, then calls the external
    API on behalf of that user. Tokens are validated by introspection (RFC 7662). Menshen
    only reports a token as active when Meet is among its audiences.
    """

    def __init__(self):
        """Initialize the Menshen client from Django settings."""

        super().__init__()

        self._client = None

        if not settings.MENSHEN_ENABLED:
            return

        self._client = TokenExchangeClient(
            config=Configuration(
                client_id=settings.MENSHEN_CLIENT_ID,
                client_secret=settings.MENSHEN_CLIENT_SECRET,
                server_root_url=settings.MENSHEN_SERVER_URL,
            )
        )

    def authenticate(self, request):
        """Introspect the bearer token with Menshen.

        Returns:
            Tuple of (user, payload) if the token is active, None otherwise
        """

        if self._client is None:
            return None

        token = get_bearer_token(request)

        if token is None:
            return None

        payload = self.introspect(token)

        if not payload.get("active"):
            # Not a Menshen token, or an expired or revoked one: defer to next
            # authentication backend
            return None

        user = self.get_user(payload)

        scopes = payload.get("scope") or ""
        payload["scope"] = [
            MENSHEN_SCOPES_MAPPING[scope]
            for scope in scopes.split()
            if scope in MENSHEN_SCOPES_MAPPING
        ]

        return (user, payload)

    def introspect(self, token):
        """Submit the token to Menshen's introspection endpoint.

        Errors are reported as an inactive token, so a Menshen outage doesn't
        prevent the next authentication backends from running.

        Args:
            token: Bearer token string

        Returns:
            Introspection response dict
        """

        try:
            response = self._client.introspect(IntrospectionRequest(token=token))
        except (requests.RequestException, ResponseParsingError) as e:
            logger.warning("Menshen introspection failed: %s", e)
            return {"active": False}

        # Permission classes expect a dict payload in request.auth
        return asdict(response)

    def get_user(self, payload):
        """Retrieve or create the user from the introspection response.

        Menshen forwards the `sub` and `email` of the subject token, as introspected
        with the OIDC provider.

        Args:
            payload: Introspection response dict

        Returns:
            User instance

        Raises:
            AuthenticationFailed: If user not found or inactive
        """

        sub = payload.get("sub")

        if not sub:
            logger.warning("Missing 'sub' in Menshen introspection response")
            raise exceptions.AuthenticationFailed("Invalid token claims.")

        try:
            user = User.objects.get(sub=sub)
        except User.DoesNotExist as e:
            if not settings.OIDC_CREATE_USER:
                logger.warning("User not found: %s", sub)
                raise exceptions.AuthenticationFailed("User not found.") from e

            user = User(sub=sub, email=payload.get("email"))
            user.set_unusable_password()
            user.save()

        if not user.is_active:
            logger.warning("Inactive user attempted authentication: %s", user.pk)
            raise exceptions.AuthenticationFailed("User account is disabled.")

        return user

    def authenticate_header(self, request):
        """Return authentication scheme for WWW-Authenticate header."""
        return "Bearer"


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

        if user is not None and not user.is_active:
            logger.warning("Inactive user attempted authentication: %s", user.pk)
            raise SuspiciousOperation("User account is disabled.")

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
