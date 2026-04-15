"""
Tests for add-ons API /sessions/init and /sessions/poll endpoints
"""

# pylint: disable=redefined-outer-name,unused-argument

import re
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from core.addons.service import (
    SessionDataError,
    SessionExpiredError,
    SessionNotFoundError,
    SuspiciousSessionError,
    TokenExchangeService,
)
from core.factories import UserFactory

pytestmark = pytest.mark.django_db


# ================================
# endpoint /addons/sessions/init/
# ================================


def test_init_feature_flag_disabled(client, settings):
    """Should return 404 on POST when feature is disabled."""
    settings.ADDONS_ENABLED = False

    response = client.post("/api/v1.0/addons/sessions/init/")
    assert response.status_code == 404


def test_init_only_accepts_post():
    """Should return 201 JSON with only transit_token and csrf_token."""

    response = APIClient().post("/api/v1.0/addons/sessions/init/")

    assert response.status_code == 201
    assert response["Content-Type"] == "application/json"

    response_data = response.json()
    # session_id must only be delivered via cookie, not in the same channel as csrf_token.
    assert set(response_data.keys()) == {"transit_token", "csrf_token"}

    transit_token = response_data["transit_token"]

    # URL-safe base64 alphabet: A-Z, a-z, 0-9, -, _
    assert re.match(r"^[A-Za-z0-9_-]+$", transit_token)

    csrf_token = response_data["csrf_token"]
    # HMAC-SHA256 → 64-character hex string.
    assert re.match(r"^[a-f0-9]{64}$", csrf_token)

    assert csrf_token != transit_token


def test_init_rejects_non_post_methods():
    """Should return 405 Method Not Allowed on GET."""
    response = APIClient().get("/api/v1.0/addons/sessions/init/")
    assert response.status_code == 405


def test_init_generates_unique_tokens_across_calls():
    """Should generate a distinct transit_token and csrf_token for every call."""

    api_client = APIClient()

    tokens = set()
    csrf_tokens = set()

    for _ in range(5):
        response = api_client.post("/api/v1.0/addons/sessions/init/")
        tokens.add(response.json()["transit_token"])
        csrf_tokens.add(response.json()["csrf_token"])

    assert len(tokens) == 5
    assert len(csrf_tokens) == 5


def test_init_cookie_authorizes_subsequent_poll():
    """Should issue a session cookie that, with the returned csrf_token, authorizes /poll."""
    api_client = APIClient()

    init_response = api_client.post("/api/v1.0/addons/sessions/init/")
    assert init_response.status_code == 201

    assert "addonsSid" in init_response.cookies

    csrf_token = init_response.json()["csrf_token"]

    poll_response = api_client.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_token,
    )

    assert poll_response.status_code == 202
    assert poll_response.json() == {"state": "pending"}


def test_init_session_id_cookie_attributes(settings):
    """Should set the session cookie with the security attributes required for iframe embedding."""
    response = APIClient().post("/api/v1.0/addons/sessions/init/")

    cookies = response.cookies
    assert list(cookies) == ["addonsSid"]  # only this cookie

    cookie = cookies["addonsSid"]
    assert re.match(r"^[A-Za-z0-9_-]+$", cookie.value), "URL-safe base64 expected"
    assert cookie["httponly"] is True, (
        "HttpOnly required — cookie must not be JS-readable"
    )
    assert cookie["secure"] is True, (
        "Secure required — cookie must not travel over HTTP"
    )
    assert cookie["samesite"] == "None", (
        "SameSite=None required for cross-origin iframe"
    )
    assert cookie["max-age"] == settings.ADDONS_SESSION_TTL


def test_init_session_id_cookie_respects_configured_name(settings):
    """Should name the session cookie according to the ADDONS_SESSION_ID_COOKIE setting."""
    api_client = APIClient()

    settings.ADDONS_SESSION_ID_COOKIE = "mockSessionSid"

    response = api_client.post("/api/v1.0/addons/sessions/init/")
    assert "mockSessionSid" in response.cookies
    assert response.cookies.get("mockSessionSid") is not None


# =================================
# endpoint /addons/sessions/poll/
# =================================


def test_poll_feature_flag_disabled(client, settings):
    """Should return 404 on POST when feature is disabled."""
    settings.ADDONS_ENABLED = False

    response = client.post("/api/v1.0/addons/sessions/poll/")
    assert response.status_code == 404


def test_poll_rejects_missing_csrf_token():
    """Should reject requests that carry the sessionSid cookie but omit the CSRF header."""
    api_client = APIClient()

    init_response = api_client.post("/api/v1.0/addons/sessions/init/")
    assert init_response.status_code == 201

    # X-CSRF-Token is deliberately omitted
    poll_response = api_client.post("/api/v1.0/addons/sessions/poll/")

    assert poll_response.status_code == 400
    assert poll_response.json() == {"detail": "Missing CSRF token."}


def test_poll_missing_cookie():
    """Should return 401 when no sessionSid cookie is present."""
    api_client = APIClient()

    poll_response = api_client.post("/api/v1.0/addons/sessions/poll/")

    assert poll_response.status_code == 401
    assert poll_response.json() == {"detail": "Missing credentials."}


def test_poll_rejects_invalid_csrf_token():
    """Should reject requests carrying an invalid CSRF token."""
    api_client = APIClient()

    init_response = api_client.post("/api/v1.0/addons/sessions/init/")
    assert init_response.status_code == 201

    poll_response = api_client.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN="invalid-csrf-token",
    )

    # SuspiciousOperation translates to 400 via Django's exception middleware.
    assert poll_response.status_code == 400


@patch(
    "core.addons.service.TokenExchangeService._get_session_data",
    side_effect=SessionNotFoundError("Session not found."),
)
def test_poll_session_not_found(mock_get_session_data):
    """Should return 404 when the session is not found."""
    api_client = APIClient()

    init_response = api_client.post("/api/v1.0/addons/sessions/init/")
    assert init_response.status_code == 201

    csrf_token = init_response.json()["csrf_token"]

    poll_response = api_client.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_token,
    )

    assert poll_response.status_code == 404
    assert poll_response.json() == {"detail": "Session not found."}


@patch(
    "core.addons.service.TokenExchangeService._get_session_data",
    side_effect=SessionDataError("Session corrupted."),
)
def test_poll_session_corrupted(mock_get_session_data):
    """Should return 400 when the session is corrupted."""
    api_client = APIClient()

    init_response = api_client.post("/api/v1.0/addons/sessions/init/")
    assert init_response.status_code == 201

    csrf_token = init_response.json()["csrf_token"]

    poll_response = api_client.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_token,
    )

    assert poll_response.status_code == 400
    assert poll_response.json() == {"detail": "Invalid or expired session."}


def test_poll_session_authenticated():
    """Should return tokens and tears down the polling channel when authenticated."""
    api_client = APIClient()

    init_response = api_client.post("/api/v1.0/addons/sessions/init/")
    assert init_response.status_code == 201

    session_id_cookie = init_response.cookies["addonsSid"]
    csrf_token = init_response.json()["csrf_token"]
    transit_token = init_response.json()["transit_token"]

    # Simulate Authentication done in the opened dialog
    service = TokenExchangeService()
    service.consume_transit_token(transit_token)
    service.set_access_token(UserFactory(), session_id_cookie.value)

    poll_response = api_client.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_token,
    )

    assert poll_response.status_code == 200
    response_data = poll_response.json()
    access_token = response_data.pop("access_token")
    assert isinstance(access_token, str) and access_token  # non-empty string
    assert response_data == {
        "expires_in": 7200,
        "scope": "room:create",
        "state": "authenticated",
        "token_type": "Bearer",
    }

    # Verify the server cleared the addonsSid cookie
    cleared_cookie = poll_response.cookies["addonsSid"]
    assert cleared_cookie.value == ""
    assert cleared_cookie["max-age"] == 0

    # Server cleared the addonsSid cookie; APIClient drops it → no credentials.
    poll_response = api_client.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_token,
    )
    assert poll_response.status_code == 401

    # Replay the original addonsSid: session was evicted on terminal read.
    api_client.cookies["addonsSid"] = session_id_cookie.value
    poll_response = api_client.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_token,
    )
    assert poll_response.status_code == 404
    assert poll_response.json() == {"detail": "Session not found."}


def test_poll_two_clients_do_not_interfere():
    """Two clients poll independently; CSRF tokens are bound to their own session."""
    client_a = APIClient()
    client_b = APIClient()

    init_a = client_a.post("/api/v1.0/addons/sessions/init/")
    init_b = client_b.post("/api/v1.0/addons/sessions/init/")
    assert init_a.status_code == 201
    assert init_b.status_code == 201

    csrf_a = init_a.json()["csrf_token"]
    csrf_b = init_b.json()["csrf_token"]
    poll_id_a = init_a.cookies["addonsSid"].value
    poll_id_b = init_b.cookies["addonsSid"].value

    # Sessions must be distinct.
    assert csrf_a != csrf_b
    assert poll_id_a != poll_id_b

    # Each client polls its own session.
    poll_a = client_a.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_a,
    )
    poll_b = client_b.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_b,
    )
    assert poll_a.status_code == 202
    assert poll_b.status_code == 202

    # Cross-use (A's cookie + B's CSRF) must be rejected.
    cross_response = client_a.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_b,
    )
    assert cross_response.status_code == 400

    # A's session transitioning to authenticated must not affect B.
    with patch(
        "core.addons.service.TokenExchangeService._get_session_data",
        return_value={
            "state": "authenticated",
            "expires_at": "foo",
            "access_token": "mock-token",
            "token_type": "Bearer",
            "expires_in": 100,
        },
    ):
        poll_a = client_a.post(
            "/api/v1.0/addons/sessions/poll/",
            HTTP_X_CSRF_TOKEN=csrf_a,
        )
        assert poll_a.status_code == 200

    poll_b = client_b.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_b,
    )
    assert poll_b.status_code == 202


def test_poll_csrf_attack_does_not_disrupt_legitimate_client():
    """CSRF attack using the pollId cookie must fail without burning the session."""
    legitimate = APIClient()

    init_response = legitimate.post("/api/v1.0/addons/sessions/init/")
    assert init_response.status_code == 201

    csrf_token = init_response.json()["csrf_token"]
    session_id_value = init_response.cookies["addonsSid"].value

    # Attacker has the cookie (SameSite=None) but not the CSRF token.
    attacker = APIClient()
    attacker.cookies["addonsSid"] = session_id_value

    # No CSRF header
    attack_no_csrf = attacker.post("/api/v1.0/addons/sessions/poll/")
    assert attack_no_csrf.status_code == 400
    assert attack_no_csrf.json() == {"detail": "Missing CSRF token."}

    # Fabricated CSRF token
    attack_bad_csrf = attacker.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN="attacker-guessed-token",
    )
    assert attack_bad_csrf.status_code == 400

    # Legitimate client's session is still usable.
    legitimate_poll = legitimate.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_token,
    )
    assert legitimate_poll.status_code == 202
    assert legitimate_poll.json() == {"state": "pending"}


# =====================================
# endpoint /addons/sessions/exchange/
# =====================================


def test_exchange_feature_flag_disabled(settings):
    """Should return 404 on POST when feature is disabled."""
    settings.ADDONS_ENABLED = False

    api_client = APIClient()
    api_client.force_authenticate(user=UserFactory())

    response = api_client.post("/api/v1.0/addons/sessions/exchange/")
    assert response.status_code == 404


def test_exchange_requires_authentication():
    """Should return 401 when the caller is not authenticated."""
    api_client = APIClient()

    response = api_client.post(
        "/api/v1.0/addons/sessions/exchange/",
        {"transit_token": "irrelevant"},
        format="json",
    )

    assert response.status_code == 401


def test_exchange_rejects_missing_transit_token():
    """Should return 400 when the request body has no transit_token."""
    api_client = APIClient()
    api_client.force_authenticate(user=UserFactory())

    response = api_client.post(
        "/api/v1.0/addons/sessions/exchange/",
        {},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Missing transit_token."}


def test_exchange_rejects_empty_transit_token():
    """Should return 400 when transit_token is present but empty."""
    api_client = APIClient()
    api_client.force_authenticate(user=UserFactory())

    response = api_client.post(
        "/api/v1.0/addons/sessions/exchange/",
        {"transit_token": ""},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Missing transit_token."}


def test_exchange_rejects_invalid_transit_token():
    """Should return 400 when the transit token is unknown or malformed."""
    api_client = APIClient()
    api_client.force_authenticate(user=UserFactory())

    response = api_client.post(
        "/api/v1.0/addons/sessions/exchange/",
        {"transit_token": "not-a-real-transit-token"},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid or expired transit token."}


def test_exchange_rejects_replayed_transit_token():
    """Should return 400 when a transit token is reused after being consumed."""
    init_client = APIClient()
    init_response = init_client.post("/api/v1.0/addons/sessions/init/")
    assert init_response.status_code == 201
    transit_token = init_response.json()["transit_token"]

    auth_client = APIClient()
    auth_client.force_authenticate(user=UserFactory())

    first = auth_client.post(
        "/api/v1.0/addons/sessions/exchange/",
        {"transit_token": transit_token},
        format="json",
    )
    assert first.status_code == 200

    second = auth_client.post(
        "/api/v1.0/addons/sessions/exchange/",
        {"transit_token": transit_token},
        format="json",
    )
    assert second.status_code == 400
    assert second.json() == {"detail": "Invalid or expired transit token."}


def test_exchange_success_enables_poll_to_complete():
    """Should bind tokens to the session so the polling completes."""
    # 1. Taskpane opens a session.
    taskpane = APIClient()
    init_response = taskpane.post("/api/v1.0/addons/sessions/init/")
    assert init_response.status_code == 201

    transit_token = init_response.json()["transit_token"]
    csrf_token = init_response.json()["csrf_token"]

    # 2. Dialog completes OIDC; post-login page (authenticated, separate
    # client — no addonsSid cookie) calls /exchange with the transit token.
    dialog = APIClient()
    dialog.force_authenticate(user=UserFactory())

    exchange_response = dialog.post(
        "/api/v1.0/addons/sessions/exchange/",
        {"transit_token": transit_token},
        format="json",
    )
    assert exchange_response.status_code == 200
    assert exchange_response.json() == {"status": "ok"}

    # 3. Taskpane's next poll transitions from pending → authenticated.
    poll_response = taskpane.post(
        "/api/v1.0/addons/sessions/poll/",
        HTTP_X_CSRF_TOKEN=csrf_token,
    )
    assert poll_response.status_code == 200
    response_data = poll_response.json()
    assert response_data["state"] == "authenticated"
    assert response_data["token_type"] == "Bearer"
    assert isinstance(response_data["access_token"], str)
    assert response_data["access_token"]


@patch(
    "core.addons.service.TokenExchangeService.set_access_token",
    side_effect=SessionNotFoundError("Session not found."),
)
def test_exchange_returns_when_session_missing(mock_set_access_token):
    """Should return 404 when the session bound to the transit token is gone."""
    init_response = APIClient().post("/api/v1.0/addons/sessions/init/")
    transit_token = init_response.json()["transit_token"]

    auth_client = APIClient()
    auth_client.force_authenticate(user=UserFactory())

    response = auth_client.post(
        "/api/v1.0/addons/sessions/exchange/",
        {"transit_token": transit_token},
        format="json",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Session not found."}


@pytest.mark.parametrize(
    "service_error",
    [SessionDataError, SessionExpiredError, SuspiciousSessionError],
)
def test_exchange_on_invalid_session(service_error):
    """Should return 400 on malformed, expired, or suspicious sessions."""
    init_response = APIClient().post("/api/v1.0/addons/sessions/init/")
    transit_token = init_response.json()["transit_token"]

    auth_client = APIClient()
    auth_client.force_authenticate(user=UserFactory())

    with patch(
        "core.addons.service.TokenExchangeService.set_access_token",
        side_effect=service_error("boom"),
    ):
        response = auth_client.post(
            "/api/v1.0/addons/sessions/exchange/",
            {"transit_token": transit_token},
            format="json",
        )

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid or expired session."}


def test_exchange_rejects_non_post_methods():
    """Should return 405 Method Not Allowed on non-POST verbs."""
    api_client = APIClient()
    api_client.force_authenticate(user=UserFactory())

    for method in ("get", "put", "patch", "delete"):
        response = getattr(api_client, method)("/api/v1.0/addons/sessions/exchange/")
        assert response.status_code == 405, f"{method.upper()} should be rejected"


def test_exchange_binds_to_authenticated_user():
    """Should pass the authenticated user to set_access_token."""
    init_response = APIClient().post("/api/v1.0/addons/sessions/init/")
    transit_token = init_response.json()["transit_token"]

    expected_user = UserFactory()
    auth_client = APIClient()
    auth_client.force_authenticate(user=expected_user)

    with patch(
        "core.addons.service.TokenExchangeService.set_access_token",
        return_value=None,
    ) as mock_set:
        response = auth_client.post(
            "/api/v1.0/addons/sessions/exchange/",
            {"transit_token": transit_token},
            format="json",
        )

    assert response.status_code == 200
    mock_set.assert_called_once()
    called_user, _called_session_id = mock_set.call_args.args
    assert called_user == expected_user
