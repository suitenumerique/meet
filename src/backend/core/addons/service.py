"""Authentication session management for add-ons using temporary cache-based sessions."""

import secrets
from datetime import datetime, timedelta, timezone
from enum import Enum
from logging import getLogger

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import SuspiciousOperation

from core.models import User
from core.services.jwt_token import JwtTokenService

logger = getLogger(__name__)


class SessionOwnershipError(Exception):
    """Raised when the claimed session_id does not match the result_token binding."""

class SessionState(str, Enum):
    """Add-on authentication session states."""

    PENDING = "pending"
    AUTHENTICATED = "authenticated"


class TokenExchangeService:
    """Manage temporary authentication sessions for add-on JWT token exchange."""

    def __init__(self):
        """Initialize the service with the configured token service."""

        self._token_service = JwtTokenService(
            secret_key=settings.ADDONS_JWT_SECRET_KEY,
            algorithm=settings.ADDONS_JWT_ALG,
            issuer=settings.ADDONS_JWT_ISSUER,
            audience=settings.ADDONS_JWT_AUDIENCE, # todo - precise
            expiration_seconds=settings.ADDONS_JWT_EXPIRATION_SECONDS,
            token_type=settings.ADDONS_JWT_TOKEN_TYPE,
        )

    def _session_cache_key(self, session_id: str) -> str:
        """Generate cache key for a session ID."""
        return f"{settings.ADDONS_SESSION_KEY_PREFIX}_{session_id}"

    def _token_cache_key(self, result_token: str) -> str:
        """Wip."""
        return f"{settings.ADDONS_SESSION_TOKEN_PREFIX}_{result_token}"

    def init_session(self) -> tuple[str, str, str]:
        """Create a new pending authentication session and return its ID."""

        session_id = secrets.token_urlsafe(settings.ADDONS_SESSION_ID_LENGTH)
        result_token = secrets.token_urlsafe(32)  # separate, never in any UR

        expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=settings.ADDONS_SESSION_TIMEOUT
        )

        session_data = {
            "state": SessionState.PENDING,
            "expires_at": expires_at.isoformat(),
        }

        # Store the session itself
        cache.set(
            self._session_cache_key(session_id),
            session_data,
            timeout=settings.ADDONS_SESSION_TIMEOUT,
        )

        # Store the token → session_id binding (same TTL)
        cache.set(
            self._token_cache_key(result_token),
            session_id,
            timeout=settings.ADDONS_SESSION_TIMEOUT,
        )

        # Transit token → session_id, very short TTL, one-time use
        transit_token = secrets.token_urlsafe(32)
        cache.set(
            f"addon_transit_{transit_token}",
            session_id,
            timeout=120
        )

        print('$$ init transit_token')
        print(transit_token)

        return session_id, result_token, transit_token

    # todo - wip
    def get_session(self, session_id: str) -> dict:
        """Retrieve session data and clear it if authenticated."""

        return self._get_and_maybe_clear(session_id)

    def get_session_by_token(self, result_token: str, claimed_session_id: str) -> dict:
        """Resolve result_token → session_id → session data.

        Verifies that the claimed_session_id matches the token binding,
        proving the caller initiated this session (ownership check).
        Clears the session once authenticated (one-time read).
        """
        session_id = cache.get(self._token_cache_key(result_token))
        if not session_id:
            return {}

        print("$$$ session_id")
        print(session_id)

        print("$$$ claimed_session_id")
        print(claimed_session_id)

        if not secrets.compare_digest(session_id, claimed_session_id):
            raise SessionOwnershipError("Session ID does not match token binding.")

        return self._get_and_maybe_clear(session_id)

    def _get_and_maybe_clear(self, session_id: str) -> dict:
        """Wip."""

        cache_key = self._session_cache_key(session_id)
        data = cache.get(cache_key)

        if not data:
            return {}

        if data.get("state") == SessionState.AUTHENTICATED:
            # One-time read: clear both the session and the token binding
            self.clear_session(session_id)

        # Return copy without internal fields
        internal_fields = {"expires_at"}
        return {k: v for k, v in data.items() if k not in internal_fields}

    def clear_session(self, session_id: str, result_token: str | None = None) -> None:
        """Wip."""
        cache.delete(self._session_cache_key(session_id))
        if result_token:
            cache.delete(self._token_cache_key(result_token))

    def set_access_token(self, user: User, session_id: str):
        """Generate and store access token for an authenticated user session."""

        cache_key = self._session_cache_key(session_id)
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

        response = self._token_service.generate_jwt(user, settings.ADDONS_SCOPES)
        new_data = {
            **existing_data,
            **response,
            "state": SessionState.AUTHENTICATED,
        }

        cache.set(cache_key, new_data, timeout=remaining_seconds)

    def token_to_session(self, result_token):
        """wip."""
        return None

    def consume_transit_token(self, transit_token: str) -> str | None:
        """Resolve and immediately delete the transit token (one-time use)."""
        key = f"addon_transit_{transit_token}"
        session_id = cache.get(key)
        if session_id:
            cache.delete(key)  # consumed — cannot be replayed
        return session_id
