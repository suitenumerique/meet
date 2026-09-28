"""User access JWT authentication for the Meet core API.

Allows an embedded frontend (e.g. rendered in an iframe, where third-party
session cookies are blocked) to authenticate requests on the core API with
a JWT, obtained by exchanging a single-use transit code (see
core.services.transit_code and the users exchange-access-token endpoint)
and passed as a Bearer header. The JWT itself never appears in any URL.

Similar to lib-jitsi-meet's token authentication, the token is bound to a
user, not to a resource: once authenticated, the request is treated
exactly like a session-authenticated one, and the existing role-based
permissions apply unchanged.
"""

import logging

from django.conf import settings

from rest_framework import exceptions

from core.external_api.authentication import BaseJWTAuthentication
from core.models import Application, ApplicationScope

logger = logging.getLogger(__name__)

USER_ACCESS_TOKEN_TYPE_CLAIM = "user_access"  # noqa: S105


class UserAccessJWTAuthentication(BaseJWTAuthentication):
    """JWT authentication for user access tokens.

    Validates user access tokens issued by the users exchange-access-token
    endpoint and authenticates the user they were issued for. A bearer
    token that does not verify against the user access token secret is
    deferred to the next authentication backend; a token that does verify
    but carries wrong claims is rejected.

    When the feature is disabled (USER_ACCESS_TOKEN_ENABLED=False), the
    backend is entirely inert: `BaseJWTAuthentication.authenticate`
    returns None before reading the Authorization header, deferring every
    request to the next authentication backend.
    """

    def __init__(self):
        """Initialize the backend with user access token settings."""
        super().__init__(
            secret_key=settings.USER_ACCESS_TOKEN_SECRET_KEY,
            algorithm=settings.USER_ACCESS_TOKEN_ALG,
            issuer=settings.USER_ACCESS_TOKEN_ISSUER,
            audience=settings.USER_ACCESS_TOKEN_AUDIENCE,
            expiration_seconds=settings.USER_ACCESS_TOKEN_TTL,
            token_type=settings.USER_ACCESS_TOKEN_TYPE,
            is_enabled=settings.USER_ACCESS_TOKEN_ENABLED,
        )

    def validate_payload(self, payload):
        """Validate the token type and the issuance-audit claim.

        Raises:
            AuthenticationFailed: If the token verified against the user
                access token secret but does not carry the expected
                claims, or if the issuing application lost its grant.
        """

        if payload.get("token_type") != USER_ACCESS_TOKEN_TYPE_CLAIM:
            logger.warning("Wrong 'token_type' in user access token payload")
            raise exceptions.AuthenticationFailed("Invalid token type.")

        if not payload.get("client_id"):
            logger.warning("Missing 'client_id' in user access token payload")
            raise exceptions.AuthenticationFailed("Invalid token claims.")

        if not Application.has_active_scope(
            payload["client_id"], ApplicationScope.USERS_SESSION
        ):
            logger.warning(
                "User access token refused: application '%s' no longer "
                "holds the '%s' grant",
                payload["client_id"],
                ApplicationScope.USERS_SESSION,
            )
            raise exceptions.AuthenticationFailed("Application access revoked.")
