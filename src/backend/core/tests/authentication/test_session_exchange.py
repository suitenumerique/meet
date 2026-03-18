"""
Tests for the session exchange API endpoint and OIDC callback view.
"""

import uuid

from django.core.cache import cache

import pytest
from rest_framework.test import APIClient

from core.authentication.views import EXCHANGE_CODE_PREFIX, EXCHANGE_CODE_TTL

pytestmark = pytest.mark.django_db


def test_session_exchange_valid_code():
    """A valid exchange code should return the session ID and be consumed."""
    code = uuid.uuid4().hex
    cache_key = f"{EXCHANGE_CODE_PREFIX}{code}"
    cache.set(cache_key, "test-session-key-123", EXCHANGE_CODE_TTL)

    client = APIClient()
    response = client.post(
        "/api/v1.0/auth/session-exchange/",
        {"code": code},
        format="json",
    )

    assert response.status_code == 200
    data = response.json()
    assert "test-session-key-123" in data.values()

    # Code should be consumed (single-use)
    assert cache.get(cache_key) is None


def test_session_exchange_invalid_code():
    """An invalid/unknown code should return 400."""
    client = APIClient()
    response = client.post(
        "/api/v1.0/auth/session-exchange/",
        {"code": uuid.uuid4().hex},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid or expired code."


def test_session_exchange_expired_code():
    """An expired code should return 400."""
    code = uuid.uuid4().hex
    cache_key = f"{EXCHANGE_CODE_PREFIX}{code}"
    # Set with 0 TTL to simulate expiration
    cache.set(cache_key, "expired-session", 0)

    client = APIClient()
    response = client.post(
        "/api/v1.0/auth/session-exchange/",
        {"code": code},
        format="json",
    )

    assert response.status_code == 400


def test_session_exchange_code_too_short():
    """A code that's too short should be rejected by validation."""
    client = APIClient()
    response = client.post(
        "/api/v1.0/auth/session-exchange/",
        {"code": "short"},
        format="json",
    )

    assert response.status_code == 400


def test_session_exchange_missing_code():
    """Missing code field should be rejected."""
    client = APIClient()
    response = client.post(
        "/api/v1.0/auth/session-exchange/",
        {},
        format="json",
    )

    assert response.status_code == 400


def test_session_exchange_replay_attack():
    """Using the same code twice should fail the second time."""
    code = uuid.uuid4().hex
    cache.set(f"{EXCHANGE_CODE_PREFIX}{code}", "session-123", EXCHANGE_CODE_TTL)

    client = APIClient()

    # First use succeeds
    response = client.post(
        "/api/v1.0/auth/session-exchange/",
        {"code": code},
        format="json",
    )
    assert response.status_code == 200

    # Second use fails
    response = client.post(
        "/api/v1.0/auth/session-exchange/",
        {"code": code},
        format="json",
    )
    assert response.status_code == 400


def test_session_exchange_returns_correct_cookie_name(settings):
    """The response key should match SESSION_COOKIE_NAME from settings."""
    settings.SESSION_COOKIE_NAME = "meet_sessionid"
    code = uuid.uuid4().hex
    cache.set(f"{EXCHANGE_CODE_PREFIX}{code}", "my-session", EXCHANGE_CODE_TTL)

    client = APIClient()
    response = client.post(
        "/api/v1.0/auth/session-exchange/",
        {"code": code},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {"meet_sessionid": "my-session"}


def test_session_exchange_get_not_allowed():
    """GET method should not be allowed on the exchange endpoint."""
    client = APIClient()
    response = client.get("/api/v1.0/auth/session-exchange/")
    assert response.status_code == 405
