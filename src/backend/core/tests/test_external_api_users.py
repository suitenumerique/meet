"""
Tests for external API /users endpoints (transit codes)
"""

# pylint: disable=W0621

from datetime import datetime, timedelta, timezone
from unittest import mock

from django.conf import settings as django_settings

import jwt
import pytest
from lasuite.oidc_resource_server.authentication import ResourceServerAuthentication
from rest_framework.test import APIClient

from core.factories import ApplicationFactory, UserFactory
from core.models import ApplicationScope
from core.services.transit_code import TransitCodeService

pytestmark = pytest.mark.django_db


def generate_addons_test_token(user, scopes):
    """Generate a valid JWT token signed with the addons secret for testing."""
    now = datetime.now(timezone.utc)

    payload = {
        "iss": django_settings.ADDONS_TOKEN_ISSUER,
        "aud": django_settings.ADDONS_TOKEN_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(seconds=django_settings.ADDONS_TOKEN_TTL),
        "scope": " ".join(scopes),
        "user_id": str(user.id),
    }

    return jwt.encode(
        payload,
        django_settings.ADDONS_TOKEN_SECRET_KEY,
        algorithm=django_settings.ADDONS_TOKEN_ALG,
    )


def generate_test_token(user, scopes, application=None):
    """Generate a valid application JWT token for testing."""
    now = datetime.now(timezone.utc)
    scope_string = " ".join(scopes)

    if application is None:
        application = ApplicationFactory(scopes=scopes)

    payload = {
        "iss": django_settings.APPLICATION_JWT_ISSUER,
        "aud": django_settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now
        + timedelta(seconds=django_settings.APPLICATION_JWT_EXPIRATION_SECONDS),
        "client_id": str(application.client_id),
        "scope": scope_string,
        "user_id": str(user.id),
        "delegated": True,
    }

    return jwt.encode(
        payload,
        django_settings.APPLICATION_JWT_SECRET_KEY,
        algorithm=django_settings.APPLICATION_JWT_ALG,
    )


def test_api_users_transit_code_requires_authentication():
    """Minting a transit code without authentication should return 401."""
    client = APIClient()
    response = client.post("/external-api/v1.0/users/transit-code/")

    assert response.status_code == 401


def test_api_users_transit_code_missing_scope():
    """A token without the 'users:session' scope should be rejected."""
    user = UserFactory()

    token = generate_test_token(user, [ApplicationScope.ROOMS_RETRIEVE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/users/transit-code/")

    assert response.status_code == 403
    assert "users:session" in str(response.data)


def test_api_users_transit_code_success(settings):
    """A delegated user with the scope should be able to mint a transit code."""
    user = UserFactory()

    token = generate_test_token(user, [ApplicationScope.USERS_SESSION])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/users/transit-code/")

    assert response.status_code == 200
    assert response.data["expires_in"] == settings.TRANSIT_CODE_TTL

    code = response.data["transit_code"]
    # Opaque, high-entropy random string
    assert len(code) == (4 * settings.TRANSIT_CODE_NBYTES + 2) // 3

    # The code is stored server-side and references the delegated user
    code_data = TransitCodeService().consume_code(code)
    assert code_data == {
        "user_id": str(user.id),
        "client_id": mock.ANY,
    }


def test_api_users_transit_code_scope_claim_exceeding_db_grant():
    """A 'users:session' claim beyond the grant recorded in database is refused."""
    user = UserFactory()
    application = ApplicationFactory(scopes=[ApplicationScope.ROOMS_RETRIEVE])

    token = generate_test_token(
        user, [ApplicationScope.USERS_SESSION], application=application
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/users/transit-code/")

    assert response.status_code == 403
    assert "not granted" in str(response.data)


def test_api_users_transit_code_get_forbidden():
    """Minting a transit code with a GET should not be allowed."""
    user = UserFactory()

    token = generate_test_token(user, [ApplicationScope.USERS_SESSION])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/users/transit-code/")

    assert response.status_code == 405


def test_api_users_transit_code_resource_server_not_supported():
    """A resource server token must not be able to mint a transit code."""
    user = UserFactory()

    with mock.patch.object(
        ResourceServerAuthentication,
        "authenticate",
        return_value=(user, {"scope": "users:session", "client_id": "rs-client"}),
    ) as mock_rs_authenticate:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer some-opaque-rs-token")
        response = client.post("/external-api/v1.0/users/transit-code/")

    assert response.status_code == 401
    mock_rs_authenticate.assert_not_called()


def test_api_users_transit_code_feature_disabled(settings):
    """Minting a transit code should return 404 when the feature is disabled."""
    settings.USER_ACCESS_TOKEN_ENABLED = False

    user = UserFactory()
    token = generate_test_token(user, [ApplicationScope.USERS_SESSION])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/users/transit-code/")

    assert response.status_code == 404


def test_api_users_transit_code_inactive_user():
    """An inactive user should not be able to mint a transit code."""
    user = UserFactory(is_active=False)

    token = generate_test_token(user, [ApplicationScope.USERS_SESSION])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/users/transit-code/")

    assert response.status_code == 401


def test_api_users_transit_code_rejects_addons_token():
    """An addons token must not be able to mint a transit code.

    The token carries the 'users:session' scope and is signed with the addons
    secret, so only the missing backend stands between it and a transit code.
    """
    user = UserFactory()
    token = generate_addons_test_token(user, [ApplicationScope.USERS_SESSION])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    with mock.patch.object(
        ResourceServerAuthentication, "authenticate", return_value=None
    ):
        response = client.post("/external-api/v1.0/users/transit-code/")

    assert response.status_code == 401
