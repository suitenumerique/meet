"""
Test users API endpoints in the Meet core app: exchange transit code.
"""

# pylint: disable=W0621

import secrets

import jwt
import pytest
from rest_framework.test import APIClient

from core.factories import ApplicationFactory, UserFactory
from core.models import ApplicationScope
from core.services.transit_code import TransitCodeService

pytestmark = pytest.mark.django_db


def decode_user_access_token(token, settings):
    """Decode a user access token with the token secret."""
    return jwt.decode(
        token,
        settings.USER_ACCESS_TOKEN_SECRET_KEY,
        algorithms=[settings.USER_ACCESS_TOKEN_ALG],
        issuer=settings.USER_ACCESS_TOKEN_ISSUER,
        audience=settings.USER_ACCESS_TOKEN_AUDIENCE,
    )


def generate_unknown_code(settings):
    """Generate a well-formed code that was never stored."""
    return secrets.token_urlsafe(settings.TRANSIT_CODE_NBYTES)


@pytest.fixture
def client():
    """Return an anonymous API client with a random source IP.

    A fresh IP per test isolates the anonymous throttle history, both
    between the tests of this module and between test runs.
    """
    # `secrets` rather than `random`: the global random module is seeded
    # deterministically by the factories, its sequence repeats across runs.
    remote_addr = (
        f"10.{secrets.randbelow(256)}.{secrets.randbelow(256)}"
        f".{secrets.randbelow(254) + 1}"
    )
    return APIClient(REMOTE_ADDR=remote_addr)


def test_exchange_access_token_missing_code(client):
    """The exchange endpoint should validate its input."""
    response = client.post("/api/v1.0/users/exchange-access-token/")

    assert response.status_code == 400
    assert "code" in response.data


def test_exchange_access_token_get_method(client):
    """The exchange endpoint should not accept GET."""

    response = client.get("/api/v1.0/users/exchange-access-token/")
    assert response.status_code == 405


def test_exchange_access_token_malformed_code(client):
    """A code whose length cannot match a generated one should be a 400."""
    response = client.post(
        "/api/v1.0/users/exchange-access-token/",
        {"code": "not-a-valid-code"},
    )

    assert response.status_code == 400
    assert "invalid transit code format" in str(response.data).lower()


def test_exchange_access_token_unknown_code(client, settings):
    """A well-formed but unknown code should be denied."""
    response = client.post(
        "/api/v1.0/users/exchange-access-token/",
        {"code": generate_unknown_code(settings)},
    )

    assert response.status_code == 403
    assert "invalid, expired or already used" in str(response.data).lower()


def test_exchange_access_token_success(client, settings):
    """A valid transit code should be exchangeable for an access token."""
    user = UserFactory()

    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 200
    assert response.data["token_type"] == settings.USER_ACCESS_TOKEN_TYPE
    assert response.data["expires_in"] == settings.USER_ACCESS_TOKEN_TTL
    assert response.data["scope"] == "user:access"

    payload = decode_user_access_token(response.data["access_token"], settings)
    assert payload["user_id"] == str(user.id)
    assert payload["client_id"] == application.client_id
    assert payload["exp"] - payload["iat"] == settings.USER_ACCESS_TOKEN_TTL


def test_exchange_access_token_single_use(client):
    """A transit code should be exchangeable exactly once."""
    user = UserFactory()

    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})
    assert response.status_code == 200

    # Replaying the same code must be denied
    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})
    assert response.status_code == 403
    assert "invalid, expired or already used" in str(response.data).lower()


def test_exchange_access_token_inactive_user(client):
    """A code minted for a now-inactive user should be denied."""
    user = UserFactory()

    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    user.is_active = False
    user.save()

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 403
    assert "no longer access" in str(response.data).lower()


def test_exchange_access_token_feature_disabled(client, settings):
    """The exchange endpoint should return 404 when the feature is disabled."""
    settings.USER_ACCESS_TOKEN_ENABLED = False

    user = UserFactory()
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 404


def test_exchange_access_token_throttled(client, settings):
    """Anonymous exchange attempts should be rate limited."""
    throttle_rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    initial_rate = throttle_rates["exchange_access_token"]
    # The rates dict is mutated in place: restore it explicitly, the
    # `settings` fixture only rolls back attribute assignments.
    throttle_rates["exchange_access_token"] = "2/minute"

    try:
        for _ in range(2):
            response = client.post(
                "/api/v1.0/users/exchange-access-token/",
                {"code": generate_unknown_code(settings)},
            )
            assert response.status_code == 403

        response = client.post(
            "/api/v1.0/users/exchange-access-token/",
            {"code": generate_unknown_code(settings)},
        )
        assert response.status_code == 429
    finally:
        throttle_rates["exchange_access_token"] = initial_rate


def test_exchange_access_token_refused_when_already_authenticated(client):
    """A session-authenticated browser must not exchange a transit code."""
    user = UserFactory()
    session_user = UserFactory()

    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    client.force_login(session_user)
    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 403
    assert "already authenticated" in str(response.data).lower()

    # The code was not consumed: it stays valid for its intended,
    # cookieless embedded context.
    client.logout()
    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})
    assert response.status_code == 200


def test_exchange_access_token_application_scope_revoked(client):
    """A code is refused once the application's grant is revoked."""
    user = UserFactory()

    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    application.scopes = []
    application.save()

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 403
    assert "no longer create user sessions" in str(response.data).lower()


def test_exchange_access_token_application_deactivated(client):
    """A code is refused once the application is disabled."""
    user = UserFactory()

    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    application.is_active = False
    application.save()

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 403
    assert "no longer create user sessions" in str(response.data).lower()


def test_exchange_access_token_unknown_application(client):
    """A code whose client_id matches no application is refused."""
    user = UserFactory()

    code = TransitCodeService().create_code(user, client_id="not-an-application")

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 403
    assert "no longer create user sessions" in str(response.data).lower()


def test_exchange_access_token_end_to_end(client):
    """A token obtained from the exchange must authenticate on the core API.

    Regression test: token issuance and token validation must stay in
    sync on the claims they set and require (e.g. 'token_type').
    """
    user = UserFactory()
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})
    assert response.status_code == 200

    api_client = APIClient()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access_token']}")
    me = api_client.get("/api/v1.0/users/me/")

    assert me.status_code == 200
    assert me.data["email"] == user.email
