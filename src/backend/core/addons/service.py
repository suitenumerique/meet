"""Authentication session management for add-ons using temporary cache-based sessions."""

import secrets
from datetime import datetime, timedelta, timezone
from enum import Enum
from logging import getLogger

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import SuspiciousOperation

from core.models import User
from core.services.jwt_token_service import TokenService

logger = getLogger(__name__)


class SessionState(str, Enum):
    """Add-on authentication session states."""

    PENDING = "pending"
    AUTHENTICATED = "authenticated"


class TokenExchangeService:
    """Manage temporary authentication sessions for add-on JWT token exchange."""

    def __init__(self):
        """Initialize the service with the configured token service."""

        self._token_service = TokenService(
            secret_key=settings.ADDONS_JWT_SECRET_KEY,
            algorithm=settings.ADDONS_JWT_ALG,
            issuer=settings.ADDONS_JWT_ISSUER,
            audience=settings.ADDONS_JWT_AUDIENCE,
            expiration_seconds=settings.ADDONS_JWT_EXPIRATION_SECONDS,
            token_type=settings.ADDONS_JWT_TOKEN_TYPE,
        )

    def _get_cache_key(self, session_id: str) -> str:
        """Generate cache key for a session ID."""
        return f"{settings.ADDONS_SESSION_KEY_PREFIX}_{session_id}"

    def init_session(self) -> str:
        """Create a new pending authentication session and return its ID."""

        session_id = secrets.token_urlsafe(settings.ADDONS_SESSION_ID_LENGTH)
        expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=settings.ADDONS_SESSION_TIMEOUT
        )

        session_data = {
            "state": SessionState.PENDING,
            "expires_at": expires_at.isoformat(),
        }

        cache_key = self._get_cache_key(session_id)
        cache.set(
            cache_key,
            session_data,
            timeout=settings.ADDONS_SESSION_TIMEOUT,
        )

        return session_id

    def get_session(self, session_id: str) -> dict:
        """Retrieve session data and clear it if authenticated."""

        cache_key = self._get_cache_key(session_id)
        data = cache.get(cache_key)

        if not data:
            return {}

        if data.get("state") == SessionState.AUTHENTICATED:
            self.clear_session(session_id)

        # Return copy without internal fields
        internal_fields = {"expires_at"}
        return {k: v for k, v in data.items() if k not in internal_fields}

    def clear_session(self, session_id: str) -> None:
        """Remove session data from cache."""

        cache_key = self._get_cache_key(session_id)
        cache.delete(cache_key)

    def set_access_token(self, user: User, session_id: str):
        """Generate and store access token for an authenticated user session."""

        cache_key = self._get_cache_key(session_id)
        existing_data = cache.get(cache_key)

        if not existing_data:
            raise SuspiciousOperation("Session not found.")

        expires_at = existing_data.get("expires_at", None)

        if not expires_at:
            self.clear_session(session_id)
            raise SuspiciousOperation("Invalid session data.")

        remaining_seconds = int(
            (
                datetime.fromisoformat(expires_at) - datetime.now(timezone.utc)
            ).total_seconds()
        )

        if remaining_seconds <= 0:
            self.clear_session(session_id)
            raise SuspiciousOperation("Session expired.")

        if existing_data.get("state") != SessionState.PENDING:
            self.clear_session(session_id)
            raise SuspiciousOperation("Access token already set.")

        response = self._token_service.generate_access_token(
            user, settings.ADDONS_SCOPES
        )
        new_data = {
            **existing_data,
            **response,
            "state": SessionState.AUTHENTICATED,
        }

        cache.set(cache_key, new_data, timeout=remaining_seconds)
