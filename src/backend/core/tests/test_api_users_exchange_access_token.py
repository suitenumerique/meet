"""
Test users API endpoints in the Meet core app: exchange transit code.
"""

# pylint: disable=W0621

import json
import secrets

import jwt
import pytest
from rest_framework.test import APIClient

from core.audit.testing import find_events
from core.factories import ApplicationFactory, UserFactory
from core.models import ApplicationScope
from core.services.transit_code import TransitCodeService
from core.tests.utils import random_remote_addr, transit_code_target

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
    """Return an anonymous API client with a random source IP."""
    return APIClient(REMOTE_ADDR=random_remote_addr())


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


def test_exchange_access_token_throttled(client, settings, monkeypatch):
    """Anonymous exchange attempts should be rate limited."""
    monkeypatch.setitem(
        settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "exchange_access_token",
        "2/minute",
    )

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


def test_exchange_access_token_success_is_audited(client, audit_events, settings):
    """An exchange is the application that minted a code acting for its user."""
    user = UserFactory(email="jean-neige@winterfell.com")
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 200

    [event] = find_events(audit_events, "transit_code.exchange")

    assert event["event"]["category"] == ["authentication"]
    assert event["event"]["type"] == ["start"]
    assert event["event"]["outcome"] == "success"
    assert event["lasuite"]["outcome"] == "success"
    assert event["lasuite"]["actor"] == {"type": "application", "sub": user.sub}
    assert event["lasuite"]["auth"] == {"method": "transit_code"}
    assert event["lasuite"]["application"] == {"client_id": application.client_id}
    assert event["user"] == {
        "id": str(user.pk),
        "domain": "winterfell.com",
        "target": {"id": str(user.pk), "domain": "winterfell.com"},
    }
    assert event["organization"] == {"id": application.client_id}
    assert event["entity"]["target"] == transit_code_target(code)
    assert event["lasuite"]["details"] == {"expires_in": settings.USER_ACCESS_TOKEN_TTL}
    assert event["http"]["response"] == {"status_code": 200}
    assert event["log"]["level"] == "info"

    serialized = json.dumps(event)
    assert code not in serialized
    assert response.data["access_token"] not in serialized


def test_exchange_access_token_unknown_code_is_audited(client, audit_events, settings):
    """A code that does not verify is a failed authentication, by its digest."""
    code = generate_unknown_code(settings)

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 403

    [event] = find_events(audit_events, "transit_code.exchange")

    # ECS expects no ``denied`` type for an authentication
    assert event["event"]["category"] == ["authentication"]
    assert event["event"]["type"] == ["start"]
    assert event["event"]["outcome"] == "failure"
    assert event["event"]["reason"] == "authentication_failed"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["actor"] == {"type": "anonymous"}
    assert event["lasuite"]["auth"] == {"method": "transit_code"}
    assert "application" not in event["lasuite"]
    assert "user" not in event
    assert "organization" not in event
    assert event["entity"]["target"] == transit_code_target(code)
    assert event["http"]["response"] == {"status_code": 403}
    assert event["error"] == {
        "message": "Invalid, expired or already used transit code."
    }
    assert event["log"]["level"] == "warning"
    assert code not in json.dumps(event)


def test_exchange_access_token_replay_is_audited(client, audit_events):
    """A replayed code is refused under the digest of its successful exchange."""
    user = UserFactory()
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    for _ in range(2):
        client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    exchanged, replayed = find_events(audit_events, "transit_code.exchange")

    assert exchanged["event"]["outcome"] == "success"
    assert replayed["event"]["reason"] == "authentication_failed"
    assert replayed["entity"]["target"] == exchanged["entity"]["target"]


@pytest.mark.parametrize(
    "revoked, message",
    [
        ("user", "This account can no longer access the application."),
        ("application", "This application can no longer create user sessions."),
    ],
)
def test_exchange_access_token_refused_verified_code_is_audited(
    client, audit_events, revoked, message
):
    """Once the code verified, its application is refused, naming its user."""
    user = UserFactory(email="jean-neige@winterfell.com")
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)

    if revoked == "user":
        user.is_active = False
        user.save()
    else:
        application.scopes = []
        application.save()

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 403

    [event] = find_events(audit_events, "transit_code.exchange")

    assert event["event"]["reason"] == "permission_denied"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["actor"] == {"type": "application"}
    assert event["lasuite"]["auth"] == {"method": "transit_code"}
    assert event["lasuite"]["application"] == {"client_id": application.client_id}
    assert event["user"] == {"target": {"id": str(user.pk), "domain": "winterfell.com"}}
    assert event["organization"] == {"id": application.client_id}
    assert event["entity"]["target"] == transit_code_target(code)
    assert event["error"] == {"message": message}


def test_exchange_access_token_deleted_user_is_audited(client, audit_events):
    """The code of a deleted account still names its application."""
    user = UserFactory()
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(user, client_id=application.client_id)
    user.delete()

    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 403

    [event] = find_events(audit_events, "transit_code.exchange")

    assert event["event"]["reason"] == "permission_denied"
    assert event["lasuite"]["application"] == {"client_id": application.client_id}
    assert "user" not in event


def test_exchange_access_token_already_authenticated_is_audited(client, audit_events):
    """A signed-in browser is refused as itself, before its code is read."""
    session_user = UserFactory(email="sansa@winterfell.com")
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    code = TransitCodeService().create_code(
        UserFactory(), client_id=application.client_id
    )

    client.force_login(session_user)
    response = client.post("/api/v1.0/users/exchange-access-token/", {"code": code})

    assert response.status_code == 403

    [event] = find_events(audit_events, "transit_code.exchange")

    assert event["event"]["reason"] == "permission_denied"
    assert event["lasuite"]["actor"] == {"type": "user", "sub": session_user.sub}
    assert event["lasuite"]["auth"] == {"method": "session"}
    assert "application" not in event["lasuite"]
    assert event["user"] == {"id": str(session_user.pk), "domain": "winterfell.com"}
    assert "entity" not in event


def test_exchange_access_token_malformed_code_is_audited(client, audit_events):
    """A malformed code is a validation error, never recorded."""
    response = client.post(
        "/api/v1.0/users/exchange-access-token/",
        {"code": "not-a-valid-code"},
    )

    assert response.status_code == 400

    [event] = find_events(audit_events, "transit_code.exchange")

    assert event["event"]["reason"] == "validation_error"
    assert event["lasuite"]["outcome"] == "failure"
    assert event["lasuite"]["actor"] == {"type": "anonymous"}
    assert event["lasuite"]["auth"] == {"method": "transit_code"}
    assert "entity" not in event
    assert "not-a-valid-code" not in json.dumps(event)


def test_exchange_access_token_throttled_is_audited(
    client, audit_events, settings, monkeypatch
):
    """A throttled attempt is denied as rate limited, before its code is read."""
    monkeypatch.setitem(
        settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "exchange_access_token",
        "1/minute",
    )

    for _ in range(2):
        response = client.post(
            "/api/v1.0/users/exchange-access-token/",
            {"code": generate_unknown_code(settings)},
        )

    assert response.status_code == 429

    _, event = find_events(audit_events, "transit_code.exchange")

    assert event["event"]["reason"] == "rate_limited"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["actor"] == {"type": "anonymous"}
    assert "entity" not in event
