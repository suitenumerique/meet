"""JWT token service."""

# pylint: disable=R0913,R0917
# ruff: noqa: PLR0913

from datetime import datetime, timedelta, timezone
from typing import Optional

from django.core.exceptions import ImproperlyConfigured

import jwt


class JwtTokenService:
    """Generic JWT token service with configurable settings."""

    def __init__(
        self,
        secret_key: str,
        algorithm: str,
        issuer: str,
        audience: str,
        expiration_seconds: int,
        token_type: str,
    ):
        """
        Initialize the token service with custom settings.

        Args:
            secret_key: Secret key for JWT encoding/decoding
            algorithm: JWT algorithm
            issuer: Token issuer identifier
            audience: Token audience identifier
            expiration_seconds: Token expiration time in seconds
            token_type: Token type

        Raises:
            ImproperlyConfigured: If secret_key is None or empty
        """
        if not secret_key:
            raise ImproperlyConfigured("Secret key is required.")
        if not algorithm:
            raise ImproperlyConfigured("Algorithm is required.")
        if not token_type:
            raise ImproperlyConfigured("Token's type is required.")
        if expiration_seconds is None:
            raise ImproperlyConfigured("Expiration's seconds is required.")

        self._key = secret_key
        self._algorithm = algorithm
        self._issuer = issuer
        self._audience = audience
        self._expiration_seconds = expiration_seconds
        self._token_type = token_type

    def generate_jwt(
        self, user, scope: str, extra_payload: Optional[dict] = None
    ) -> dict:
        """
        Generate an access token for the given user.

        Note: any extra_payload variables named iat, exp, or user_id will
        be overwritten by this service

        Args:
            user: User instance for whom to generate the token
            scope: Space-separated scope string

        Returns:
            Dictionary containing access_token, token_type, expires_in, and scope optionally
        """
        now = datetime.now(timezone.utc)

        payload = extra_payload.copy() if extra_payload else {}

        payload.update(
            {
                "iat": now,
                "exp": now + timedelta(seconds=self._expiration_seconds),
                "user_id": str(user.id),
            }
        )

        if self._issuer:
            payload["iss"] = self._issuer
        if self._audience:
            payload["aud"] = self._audience
        if scope:
            payload["scope"] = scope

        token = jwt.encode(
            payload,
            self._key,
            algorithm=self._algorithm,
        )

        response = {
            "access_token": token,
            "token_type": self._token_type,
            "expires_in": self._expiration_seconds,
        }

        if scope:
            response["scope"] = scope

        return response
