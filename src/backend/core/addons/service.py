"""Authentication session management for add-ons using temporary cache-based sessions."""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from enum import Enum
from logging import getLogger

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured

from core.models import User
from core.services.jwt_token import JwtTokenService

logger = getLogger(__name__)

_PUBLIC_SESSION_FIELDS = frozenset(
    {"state", "access_token", "token_type", "expires_in", "scope"}
)


class SessionDataError(Exception):
    """Raised when session data is invalid or malformed."""


class CSRFTokenError(Exception):
    """Raised when CSRF token verification fails."""


class TransitTokenError(Exception):
    """Raised when a transit token is invalid or expired."""


class SessionExpiredError(Exception):
    """Raised when a session has expired."""


class SessionNotFoundError(Exception):
    """Raised when a session is not found."""


class SuspiciousSessionError(Exception):
    """Raised when session state indicates a possible attack or bug."""


class SessionState(str, Enum):
    """Add-on authentication session lifecycle states."""

    PENDING = "pending"
    AUTHENTICATED = "authenticated"


class TransitTokenState(str, Enum):
    """Transit token lifecycle states; CONSUMED is retained to detect replay."""

    PENDING = "pending"
    CONSUMED = "consumed"


class TokenExchangeService:
    """Manage temporary authentication sessions for add-on JWT token exchange."""

    def __init__(self):
        """Build the underlying JWT service and validate required settings."""

        if not settings.ADDONS_CSRF_SECRET:
            raise ImproperlyConfigured("CSRF Secret is required.")

        if not settings.ADDONS_TOKEN_SCOPE:
            raise ImproperlyConfigured("Token scope must be defined.")

        self._token_service = JwtTokenService(
            secret_key=settings.ADDONS_TOKEN_SECRET_KEY,
            algorithm=settings.ADDONS_TOKEN_ALG,
            issuer=settings.ADDONS_TOKEN_ISSUER,
            audience=settings.ADDONS_TOKEN_AUDIENCE,
            expiration_seconds=settings.ADDONS_TOKEN_TTL,
            token_type=settings.ADDONS_TOKEN_TYPE,
        )

    @staticmethod
    def _cache_key(prefix: str, token: str) -> str:
        """Build a namespaced cache key: ``addons_{prefix}_{token}``."""
        return f"addons_{prefix}_{token}"

    @staticmethod
    def _derive_csrf_token(session_id: str) -> str:
        """Derive the CSRF token as HMAC-SHA256(session_id) under ADDONS_CSRF_SECRET."""
        return hmac.new(
            settings.ADDONS_CSRF_SECRET.encode("utf-8"),
            session_id.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    @staticmethod
    def _validate_session_not_expired(session_data: dict) -> int:
        """Return remaining seconds until expiry, or raise if missing/malformed/expired."""
        expires_at_str = session_data.get("expires_at")
        if expires_at_str is None:
            raise SessionDataError("Invalid session data: missing expiration.")

        try:
            expires_at = datetime.fromisoformat(expires_at_str)
        except ValueError as e:
            raise SessionDataError("Invalid session data: malformed expiration.") from e

        remaining_seconds = int(
            (expires_at - datetime.now(timezone.utc)).total_seconds()
        )

        if remaining_seconds <= 0:
            raise SessionExpiredError("Session expired.")

        return remaining_seconds

    def _generate_session_id(self) -> str:
        """Generate a high-entropy URL-safe session_id."""
        return secrets.token_urlsafe(settings.ADDONS_RANDOM_TOKEN_BYTE_LENGTH)

    def _generate_transit_token(self) -> str:
        """Generate a high-entropy URL-safe transit token."""
        return secrets.token_urlsafe(settings.ADDONS_RANDOM_TOKEN_BYTE_LENGTH)

    def init_session(self) -> tuple[str, str, str]:
        """Create a new pending session and its transit binding.

        Returns:
            (transit_token, session_id, csrf_token)
        """
        session_id = self._generate_session_id()
        transit_token = self._generate_transit_token()
        csrf_token = self._derive_csrf_token(session_id)

        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=settings.ADDONS_SESSION_TTL)
        ).isoformat()

        session_data = {
            "state": SessionState.PENDING,
            "expires_at": expires_at,
            "transit_token": transit_token,
        }

        cache.set(
            self._cache_key(settings.ADDONS_CACHE_PREFIX_SESSION, session_id),
            session_data,
            settings.ADDONS_SESSION_TTL,
        )

        transit_token_data = {
            "session_id": session_id,
            "state": TransitTokenState.PENDING,
        }

        cache.set(
            self._cache_key(settings.ADDONS_CACHE_PREFIX_TRANSIT, transit_token),
            transit_token_data,
            settings.ADDONS_TRANSIT_TOKEN_TTL,
        )

        return transit_token, session_id, csrf_token

    def verify_csrf(self, session_id: str, submitted_csrf: str) -> None:
        """Constant-time verify submitted_csrf against HMAC(session_id). Raise on mismatch."""
        expected_csrf = self._derive_csrf_token(session_id)
        if not hmac.compare_digest(expected_csrf, submitted_csrf):
            raise CSRFTokenError("Invalid CSRF token.")

    def consume_transit_token(self, transit_token: str) -> str:
        """Mark transit token consumed and return its session_id.

        A replay (second consume) evicts the session as a security cleanup and raises.

        Raises:
            TransitTokenError: If token is unknown, expired, or already consumed.
        """
        cache_key = self._cache_key(settings.ADDONS_CACHE_PREFIX_TRANSIT, transit_token)

        transit_token_data = cache.get(cache_key)

        if transit_token_data is None:
            # Indistinguishable from here: either the token was never issued (attacker
            # probing or client bug) or it was issued but expired before consumption.
            logger.warning(
                "Transit token not found in cache (unknown or expired).",
            )
            raise TransitTokenError("Invalid or expired transit token.")

        state = transit_token_data.get("state", None)
        session_id = transit_token_data.get("session_id", None)

        if not session_id:
            logger.warning("Transit token data missing session_id.")
            raise TransitTokenError("Invalid transit token.")

        if state == TransitTokenState.CONSUMED:
            logger.warning(
                "Replay on session %s",
                session_id,
            )

            # Security cleanup: a replay attempt means the transit token leaked
            # (or an attacker is probing). Evict the session so the authenticated
            # tokens — if they exist — can no longer be polled.
            cache.delete(
                self._cache_key(settings.ADDONS_CACHE_PREFIX_SESSION, session_id)
            )

            raise TransitTokenError("Transit token already consumed.")

        new_transit_token_data = {
            "state": TransitTokenState.CONSUMED,
            "session_id": session_id,
        }

        cache.set(
            cache_key,
            new_transit_token_data,
            settings.ADDONS_SESSION_TTL,
        )

        return session_id

    @staticmethod
    def is_session_pending(session_data: dict) -> bool:
        """Return True if the public session dict is still in the pending state."""
        return session_data.get("state") == SessionState.PENDING

    def _get_session_data(self, session_id: str) -> dict:
        """Fetch raw session data from cache, or raise SessionNotFoundError."""

        if not session_id:
            raise SessionNotFoundError("Session not found.")

        data = cache.get(
            self._cache_key(settings.ADDONS_CACHE_PREFIX_SESSION, session_id)
        )
        if data is None:
            raise SessionNotFoundError("Session not found.")
        return data

    def get_session(self, session_id: str) -> dict:
        """Return the public session view; evict the session on authenticated read.

        Raises:
            SessionNotFoundError: If session is not found.
            SessionDataError: If session data is missing the state field.
        """

        # raises if session is not found
        session_data = self._get_session_data(session_id)

        if "state" not in session_data:
            raise SessionDataError("Invalid session data: missing state field.")

        # One-time read: clear both bindings for authenticated sessions
        if session_data["state"] == SessionState.AUTHENTICATED:
            cache.delete(
                self._cache_key(settings.ADDONS_CACHE_PREFIX_SESSION, session_id)
            )

        # Return public fields only
        return {k: v for k, v in session_data.items() if k in _PUBLIC_SESSION_FIELDS}

    def _validate_transit_token_state(self, session_data: dict) -> None:
        """Assert the session's transit token exists in cache and is in CONSUMED state.

        Raises:
            SessionDataError: session_data is missing the transit_token field.
            SuspiciousSessionError: transit entry is missing, or still pending (flow skipped).
        """

        transit_token = session_data.get("transit_token", None)
        if transit_token is None:
            raise SessionDataError("Invalid session data: missing transit_token field.")

        transit_token_data = cache.get(
            self._cache_key(settings.ADDONS_CACHE_PREFIX_TRANSIT, transit_token)
        )

        if transit_token_data is None:
            logger.warning("Transit token missing when setting access token.")
            raise SuspiciousSessionError("Transit token not found.")

        if transit_token_data.get("state") != TransitTokenState.CONSUMED:
            logger.warning("Access token requested without completing transit flow.")
            raise SuspiciousSessionError("Transit token not consumed.")

    def set_access_token(self, user: User, session_id: str) -> None:
        """Authenticate a pending session by minting a JWT and storing it on the session.

        Non-pending sessions are evicted as a security cleanup before raising.

        Raises:
            SessionNotFoundError: If session doesn't exist.
            SessionDataError: If session data is malformed.
            SessionExpiredError: If session has expired.
            SuspiciousSessionError: If session is not pending or transit wasn't consumed.
        """

        # raises if session is not found
        session_data = self._get_session_data(session_id)

        if session_data.get("state") != SessionState.PENDING:
            logger.warning(
                "Session's state is not pending. Suspicious.",
            )
            # Security cleanup: evict the session so any cached tokens cannot be polled.
            cache.delete(
                self._cache_key(settings.ADDONS_CACHE_PREFIX_SESSION, session_id)
            )
            raise SuspiciousSessionError("Session is not in pending state.")

        # raises if transit_token is invalid
        try:
            self._validate_transit_token_state(session_data)
        except SuspiciousSessionError:
            # Security cleanup: evict the session.
            cache.delete(
                self._cache_key(settings.ADDONS_CACHE_PREFIX_SESSION, session_id)
            )
            raise

        # raises if session is expired
        remaining_seconds = self._validate_session_not_expired(session_data)

        response = self._token_service.generate_jwt(user, settings.ADDONS_TOKEN_SCOPE)

        new_data = {
            "access_token": response["access_token"],
            "token_type": response["token_type"],
            "expires_in": response["expires_in"],
            "scope": response["scope"],
            "expires_at": session_data["expires_at"],
            "state": SessionState.AUTHENTICATED,
        }

        cache.set(
            self._cache_key(settings.ADDONS_CACHE_PREFIX_SESSION, session_id),
            new_data,
            remaining_seconds,
        )
