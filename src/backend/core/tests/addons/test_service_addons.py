"""
Unit tests for TokenExchangeService.
"""

# pylint: disable=redefined-outer-name,unused-argument,protected-access

from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured

import pytest

from core.addons.service import (
    _PUBLIC_SESSION_FIELDS,
    CSRFTokenError,
    SessionDataError,
    SessionExpiredError,
    SessionNotFoundError,
    SessionState,
    SuspiciousSessionError,
    TokenExchangeService,
    TransitTokenError,
    TransitTokenState,
)

from ...factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def service():
    """Fresh service instance per test."""
    return TokenExchangeService()


# ==============================
# init
# ==============================


def test_init_service_improperly_configured_secret_token(settings):
    """Should raise ImproperlyConfigured when ADDONS_TOKEN_SECRET_KEY is unset."""

    settings.ADDONS_TOKEN_SECRET_KEY = None

    with pytest.raises(ImproperlyConfigured, match="Secret key is required."):
        TokenExchangeService()


def test_init_service_improperly_configured_token_scope(settings):
    """Should raise ImproperlyConfigured when ADDONS_TOKEN_SCOPE is empty."""

    settings.ADDONS_TOKEN_SCOPE = None

    with pytest.raises(ImproperlyConfigured, match="Token scope must be defined."):
        TokenExchangeService()


def test_init_service_raises_when_csrf_secret_missing(settings):
    """Should raise ImproperlyConfigured when ADDONS_CSRF_SECRET is unset."""
    settings.ADDONS_CSRF_SECRET = None

    with pytest.raises(ImproperlyConfigured, match="CSRF Secret is required."):
        TokenExchangeService()


# ==============================
# init_session
# ==============================


def test_init_session_returns_three_distinct_tokens(service):
    """Should return (transit_token, session_id, csrf_token), all distinct and non-empty."""
    transit_token, session_id, csrf_token = service.init_session()

    assert transit_token
    assert session_id
    assert csrf_token
    assert len({transit_token, session_id, csrf_token}) == 3


def test_init_session_starts_in_pending_state(service):
    """Should return a pending initialized session."""
    transit_token, session_id, _ = service.init_session()

    session_data = cache.get(f"addons_sid_{session_id}")

    assert session_data["state"] == SessionState.PENDING
    assert "access_token" not in session_data

    transit_data = cache.get(f"addons_transit_{transit_token}")

    # Transit token should be bind to the same session
    assert transit_data.get("session_id") == session_id
    assert transit_data.get("state") == TransitTokenState.PENDING


def test_init_session_bind_transit_token_with_session(service):
    """Should bind transit_token with the initialized session."""
    transit_token, session_id, _ = service.init_session()

    transit_data = cache.get(f"addons_transit_{transit_token}")

    assert transit_data.get("session_id") == session_id
    assert transit_data.get("state") == TransitTokenState.PENDING


def test_init_session_creates_independent_cache_entries(service):
    """Should write to distinct cache keys when called multiple times."""
    transit_a, session_id_a, csrf_a = service.init_session()
    transit_b, session_id_b, csrf_b = service.init_session()

    assert transit_a != transit_b
    assert session_id_a != session_id_b
    assert csrf_a != csrf_b


def test_init_session_csrf_token_is_derived_from_session_id(service, settings):
    """Should derive the csrf_token as HMAC(session_id, ADDONS_CSRF_SECRET)."""
    _, session_id, csrf_token = service.init_session()

    # Same inputs, same output: derivation is pure.
    assert csrf_token == service._derive_csrf_token(session_id)
    assert csrf_token == service._derive_csrf_token(
        session_id
    )  # deterministic across calls

    assert len(csrf_token) == 64
    assert all(c in "0123456789abcdef" for c in csrf_token)

    # CSRF token is bound to the secret: rotating it invalidates outstanding tokens.
    settings.ADDONS_CSRF_SECRET = "another-secret-entirely"
    assert csrf_token != service._derive_csrf_token(session_id)

    # CSRF token is bound to the session_id: same secret, different session ≠ same token.
    settings.ADDONS_CSRF_SECRET = "secret-key-padded-for-minimum-len!-addons"  # restore
    _, other_session_id, _ = service.init_session()
    assert service._derive_csrf_token(session_id) != service._derive_csrf_token(
        other_session_id
    )


def test_init_session_tokens_have_sufficient_entropy(service):
    """Should be long enough by default that collision is negligible."""
    transit_token, session_id, csrf_token = service.init_session()

    assert len(transit_token) >= 40
    assert len(session_id) >= 40
    assert len(csrf_token) == 64


def test_init_session_respects_configured_ttls(service, settings):
    """Should respect their respective TTL configured through settings."""

    transit_token, session_id, _ = service.init_session()

    session_a_ttl = cache.ttl(f"addons_sid_{session_id}")
    transit_a_ttl = cache.ttl(f"addons_transit_{transit_token}")

    # By default, transit token has a shorter TTL
    assert transit_a_ttl < session_a_ttl

    settings.ADDONS_SESSION_TTL = 3000
    settings.ADDONS_TRANSIT_TOKEN_TTL = 60

    transit_token_b, session_id_b, _ = service.init_session()

    session_b_ttl = cache.ttl(f"addons_sid_{session_id_b}")
    transit_b_ttl = cache.ttl(f"addons_transit_{transit_token_b}")

    assert abs(session_b_ttl - 3000) <= 2
    assert abs(transit_b_ttl - 60) <= 2


# ==============================
# verify_csrf
# ==============================


def test_verify_csrf_accepts_matching_token(service):
    """Should verify against its session_id."""
    _, session_id, csrf_token = service.init_session()

    assert service.verify_csrf(session_id, csrf_token) is None


def test_verify_csrf_is_deterministic_for_same_session(service):
    """Should yield the same token when deriving CSRF twice."""
    _, session_id, csrf_token = service.init_session()

    # Verify once, then verify again, both must succeed because
    # _derive_csrf_token is a pure function of session_id + secret.
    # without raising exceptions;
    assert service.verify_csrf(session_id, csrf_token) is None
    assert service.verify_csrf(session_id, csrf_token) is None


def test_verify_csrf_rejects_after_secret_rotation(service, settings):
    """Should invalidate tokens issued under the old secret when ADDONS_CSRF_SECRET was rotated."""
    _, session_id, csrf_token = service.init_session()

    # Rotate the secret
    settings.ADDONS_CSRF_SECRET = "different-secret-entirely"

    with pytest.raises(CSRFTokenError, match="Invalid CSRF token."):
        service.verify_csrf(session_id, csrf_token)


def test_verify_csrf_rejects_foreign_token(service):
    """Should reject against another csrf_token."""
    _, session_id_a, _ = service.init_session()
    _, _, csrf_b = service.init_session()

    with pytest.raises(CSRFTokenError, match="Invalid CSRF token."):
        service.verify_csrf(session_id_a, csrf_b)


def test_verify_csrf_rejects_random_token(service):
    """Should reject against a random csrf_token."""
    _, session_id_a, _ = service.init_session()

    with pytest.raises(CSRFTokenError, match="Invalid CSRF token."):
        service.verify_csrf(session_id_a, "wrong-csrf-value")


def test_verify_csrf_rejects_empty_token(service):
    """Should reject against an empty csrf_token."""
    _, session_id_a, _ = service.init_session()

    with pytest.raises(CSRFTokenError, match="Invalid CSRF token."):
        service.verify_csrf(session_id_a, "")


def test_verify_csrf_is_case_sensitive(service):
    """Should be case-sensitive (HMAC output is lowercase hex)."""
    _, session_id, csrf_token = service.init_session()

    with pytest.raises(CSRFTokenError, match="Invalid CSRF token."):
        service.verify_csrf(session_id, csrf_token.upper())


# ==============================
# get_session
# ==============================


def test_get_session_raises_when_missing(service):
    """Should raise SessionNotFoundError for an unknown session_id."""
    with pytest.raises(SessionNotFoundError, match="Session not found."):
        service.get_session("nonexistent-session-id")


def test_get_session_authenticated_returns_token_then_evicts(service):
    """Should return tokens once and evict session when authenticated."""

    user = UserFactory()
    transit_token_a, session_id_a, _ = service.init_session()
    _, session_id_b, _ = service.init_session()

    # Authenticate the session
    service.consume_transit_token(transit_token_a)
    service.set_access_token(user, session_id_a)

    # First read: returns the token payload.
    result = service.get_session(session_id_a)
    assert result["state"] == SessionState.AUTHENTICATED
    assert "access_token" in result

    # Assert session_a is evicted from the cache
    session_data_a = cache.get(f"addons_sid_{session_id_a}")
    assert session_data_a is None

    # Second read: binding was evicted.
    with pytest.raises(SessionNotFoundError, match="Session not found."):
        service.get_session(session_id_a)

    # Assert session_b is untouched
    session_data_b = cache.get(f"addons_sid_{session_id_b}")
    assert session_data_b is not None
    assert session_data_b.get("state") == SessionState.PENDING


def test_get_session_pending_preserve_cache(service):
    """Should keep session state in cache when the session is pending."""

    _, session_id, _ = service.init_session()

    # First read: returns the pending session.
    result_1 = service.get_session(session_id)
    assert result_1["state"] == SessionState.PENDING
    assert "access_token" not in result_1

    # Second read: returns the pending session.
    result_2 = service.get_session(session_id)
    assert result_2["state"] == SessionState.PENDING
    assert "access_token" not in result_2


def test_get_session_pending_only_exposes_public_fields(service):
    """Should only return whitelisted public fields when session is pending."""
    _, session_id, _ = service.init_session()

    session = service.get_session(session_id)

    assert set(session.keys()) <= _PUBLIC_SESSION_FIELDS
    assert session["state"] == SessionState.PENDING

    assert "expires_at" not in session
    assert "transit_token" not in session


def test_get_session_authenticated_only_exposes_public_fields(service):
    """Should only return whitelisted public fields when session is authenticated."""

    transit_token, session_id, _ = service.init_session()

    # Authenticate the session
    user = UserFactory()
    service.consume_transit_token(transit_token)
    service.set_access_token(user, session_id)

    session = service.get_session(session_id)

    assert session["state"] == SessionState.AUTHENTICATED
    assert set(session.keys()) <= _PUBLIC_SESSION_FIELDS

    assert "expires_at" not in session
    assert "transit_token" not in session


def test_get_session_empty_string(service):
    """Should raise SessionNotFoundError if session is empty."""

    with pytest.raises(SessionNotFoundError, match="Session not found."):
        service.get_session("")


def test_get_session_corrupted_session_data(service):
    """Should raise SessionDataError if session's data is corrupted."""
    session_id = "mock-corrupted-session-id"
    cache.set(f"addons_sid_{session_id}", {"invalid": "invalid-value"})

    with pytest.raises(
        SessionDataError, match="Invalid session data: missing state field."
    ):
        service.get_session(session_id)


# ==============================
# consume_transit_token
# ==============================


def test_consume_transit_token_returns_session_id(service):
    """Should return the session_id the transit token was bound to."""
    _, session_id, _ = service.init_session()
    transit_token = cache.get(f"addons_sid_{session_id}")["transit_token"]

    returned_session_id = service.consume_transit_token(transit_token)

    assert returned_session_id == session_id


def test_consume_transit_token_replay_raises(service):
    """Should raise on the second consume of the same transit token."""
    transit_token, _, _ = service.init_session()

    service.consume_transit_token(transit_token)

    with pytest.raises(TransitTokenError, match="Transit token already consumed."):
        service.consume_transit_token(transit_token)


def test_consume_transit_token_replay_evicts_session(service):
    """Should evict the session as security cleanup when a replay is detected."""
    transit_token, session_id, _ = service.init_session()

    service.consume_transit_token(transit_token)
    assert service.get_session(session_id)

    with pytest.raises(TransitTokenError):
        service.consume_transit_token(transit_token)

    # After replay, the session is gone.
    with pytest.raises(SessionNotFoundError):
        service.get_session(session_id)


def test_consume_transit_token_raises_on_unknown_token(service):
    """Should raise TransitTokenError when the transit token is unknown or expired."""

    with pytest.raises(TransitTokenError, match="Invalid or expired transit token."):
        service.consume_transit_token("nonexistent-transit-token")


def test_consume_transit_token_replay_when_session_already_gone(service):
    """Should still detect replay even if the session was evicted independently."""
    transit_token, session_id, _ = service.init_session()
    service.consume_transit_token(transit_token)

    # Simulate session evicted independently
    cache.delete(f"addons_sid_{session_id}")

    with pytest.raises(TransitTokenError, match="Transit token already consumed."):
        service.consume_transit_token(transit_token)


def test_consume_transit_token_extends_ttl_for_replay_detection(service, settings):
    """Should extend the consumed transit entry's TTL to session length."""
    settings.ADDONS_SESSION_TTL = 3000
    settings.ADDONS_TRANSIT_TOKEN_TTL = 60

    transit_token, _, _ = service.init_session()

    # Before consume: transit has the short TTL.
    assert cache.ttl(f"addons_transit_{transit_token}") <= 60 + 1

    service.consume_transit_token(transit_token)

    # After consume: TTL is extended to session length.
    assert cache.ttl(f"addons_transit_{transit_token}") > 60


# ==============================
# set_access_token
# ==============================


def test_set_access_token_writes_jwt_fields_to_session(service, settings):
    """Should populate the session with JWT fields and flip state to authenticated."""
    user = UserFactory()
    transit_token, session_id, _ = service.init_session()
    service.consume_transit_token(transit_token)

    service.set_access_token(user, session_id)

    session = service.get_session(session_id)
    assert session["state"] == SessionState.AUTHENTICATED
    assert session["access_token"]
    assert session["token_type"] == settings.ADDONS_TOKEN_TYPE
    assert session["expires_in"] == settings.ADDONS_TOKEN_TTL
    assert session["scope"] == settings.ADDONS_TOKEN_SCOPE


def test_set_access_token_preserves_remaining_ttl(service, settings):
    """Should inherit the pending session's remaining TTL rather than resetting it."""
    settings.ADDONS_SESSION_TTL = 3000

    user = UserFactory()
    transit_token, session_id, _ = service.init_session()
    service.consume_transit_token(transit_token)

    ttl_before = cache.ttl(f"addons_sid_{session_id}")
    service.set_access_token(user, session_id)
    ttl_after = cache.ttl(f"addons_sid_{session_id}")

    # TTL must not jump back to full — allow small tolerance for execution time.
    assert ttl_after <= ttl_before + 1
    # And it shouldn't have somehow grown beyond the session length either.
    assert ttl_after <= 3000


def test_authenticating_one_session_leaves_others_pending(service):
    """Should leave other pending sessions untouched when authenticating one."""
    user = UserFactory()

    transit_a, session_id_a, _ = service.init_session()
    _, session_id_b, _ = service.init_session()

    service.consume_transit_token(transit_a)
    service.set_access_token(user, session_id_a)

    session_b = service.get_session(session_id_b)
    assert session_b["state"] == SessionState.PENDING
    assert "access_token" not in session_b


def test_set_access_token_raises_when_transit_entry_missing(service):
    """Should raise when the transit cache entry is gone (TTL expired or evicted)."""
    user = UserFactory()
    transit_token, session_id, _ = service.init_session()

    # Manually delete the transit entry, simulating expiry or eviction.
    cache.delete(f"addons_transit_{transit_token}")

    with pytest.raises(SuspiciousSessionError, match="Transit token not found."):
        service.set_access_token(user, session_id)


def test_set_access_token_raises_if_transit_token_not_consumed(service):
    """Should refuse to authenticate a session whose transit token hasn't been consumed."""

    user = UserFactory()
    _, session_id, _ = service.init_session()

    with pytest.raises(SuspiciousSessionError, match="Transit token not consumed."):
        service.set_access_token(user, session_id)

    assert cache.get(f"addons_sid_{session_id}") is None


def test_set_access_token_raises_on_missing_transit_token_field(service):
    """Should raise SessionDataError when session data is missing the transit_token field."""
    user = UserFactory()
    transit_token, session_id, _ = service.init_session()
    service.consume_transit_token(transit_token)

    corrupted = cache.get(f"addons_sid_{session_id}")
    del corrupted["transit_token"]
    cache.set(f"addons_sid_{session_id}", corrupted, 3600)

    with pytest.raises(SessionDataError, match="missing transit_token field"):
        service.set_access_token(user, session_id)


def test_set_access_token_raises_if_double_authenticated(service):
    """Should raise and wipe the session on double-auth while leaving the transit token intact."""
    user = UserFactory()
    transit_token, _, _ = service.init_session()

    session_id = service.consume_transit_token(transit_token)
    service.set_access_token(user, session_id)

    with pytest.raises(
        SuspiciousSessionError, match="Session is not in pending state."
    ):
        service.set_access_token(user, session_id)

    # Nuke session data as a security cleanup
    session_data = cache.get(f"addons_sid_{session_id}")
    assert session_data is None

    transit_data = cache.get(f"addons_transit_{transit_token}")
    assert transit_data.get("state") == TransitTokenState.CONSUMED


def test_set_access_token_raises_when_session_missing(service):
    """Should raise SessionNotFoundError when called with an unknown session_id."""
    user = UserFactory()

    with pytest.raises(SessionNotFoundError, match="Session not found."):
        service.set_access_token(user, "nonexistent-session-id")


def test_set_access_token_rejects_malformed_expires_at(service):
    """Should raise SessionDataError when the cached expires_at is not valid ISO 8601."""
    user = UserFactory()
    transit_token, _, _ = service.init_session()
    session_id = service.consume_transit_token(transit_token)

    # Corrupt the cached session directly.
    corrupted = cache.get(f"addons_sid_{session_id}")
    corrupted["expires_at"] = "not-an-iso-string"
    cache.set(f"addons_sid_{session_id}", corrupted, 3600)

    with pytest.raises(SessionDataError, match="malformed expiration"):
        service.set_access_token(user, session_id)


def test_set_access_token_rejects_missing_expires_at(service):
    """Should raise SessionDataError when the cached session is missing the expires_at field."""
    user = UserFactory()
    transit_token, _, _ = service.init_session()
    session_id = service.consume_transit_token(transit_token)

    corrupted = cache.get(f"addons_sid_{session_id}")
    del corrupted["expires_at"]
    cache.set(f"addons_sid_{session_id}", corrupted, 3600)

    with pytest.raises(SessionDataError, match="missing expiration"):
        service.set_access_token(user, session_id)


def test_set_access_token_raises_when_session_expired(service):
    """Should raise SessionExpiredError when the cached session's expires_at is in the past."""
    user = UserFactory()
    transit_token, session_id, _ = service.init_session()
    service.consume_transit_token(transit_token)

    # Simulate expiry: rewrite expires_at into the past.
    corrupted = cache.get(f"addons_sid_{session_id}")
    corrupted["expires_at"] = "2020-01-01T00:00:00+00:00"
    cache.set(f"addons_sid_{session_id}", corrupted, 3600)

    with pytest.raises(SessionExpiredError, match="Session expired."):
        service.set_access_token(user, session_id)
