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


def generate_test_token(user, scopes):
    """Generate a valid application JWT token for testing."""
    now = datetime.now(timezone.utc)
    scope_string = " ".join(scopes)

    application = ApplicationFactory()

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


def test_api_users_transit_code_with_rs_token():
    """A resource-server-authenticated user should be able to mint a code."""
    user = UserFactory()

    # todo - add a decorator instead
    with mock.patch.object(
        ResourceServerAuthentication,
        "authenticate",
        return_value=(user, {"scope": "users:session", "client_id": "rs-client"}),
    ) as mock_rs_authenticate:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer some-opaque-rs-token")
        response = client.post("/external-api/v1.0/users/transit-code/")

    mock_rs_authenticate.assert_called_once()
    assert response.status_code == 200

    code_data = TransitCodeService().consume_code(response.data["transit_code"])
    assert code_data == {
        "user_id": str(user.id),
        "client_id": "rs-client",
    }


def test_api_users_transit_code_with_rs_token_missing_scope():
    """A resource server token without the scope should be rejected."""
    user = UserFactory()

    # todo - add a decorator instead
    with mock.patch.object(
        ResourceServerAuthentication,
        "authenticate",
        return_value=(user, {"scope": "rooms:list", "client_id": "rs-client"}),
    ):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer some-opaque-rs-token")
        response = client.post("/external-api/v1.0/users/transit-code/")

    assert response.status_code == 403
    assert "users:session" in str(response.data)


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


# todo - add a test to make sure the addon authentification doesn't allow to mint a transit token
