"""
Tests for external API /token endpoint
"""

# pylint: disable=W0621

import jwt
import pytest
from freezegun import freeze_time
from rest_framework.test import APIClient

from core.factories import (
    ApplicationDomainFactory,
    ApplicationFactory,
    UserFactory,
)
from core.models import ApplicationScope, User

pytestmark = pytest.mark.django_db


def test_api_applications_generate_token_success(settings):
    """Valid credentials should return a JWT token."""
    UserFactory(email="User.Family@example.com")
    application = ApplicationFactory(
        active=True,
        scopes=[ApplicationScope.ROOMS_LIST, ApplicationScope.ROOMS_CREATE],
    )

    # Store plain secret before it's hashed
    plain_secret = "test-secret-123"
    application.client_secret = plain_secret
    application.save()

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": "user.family@example.com",
        },
        format="json",
    )

    assert response.status_code == 200
    assert "access_token" in response.data

    response.data.pop("access_token")

    assert response.data == {
        "token_type": "Bearer",
        "expires_in": settings.APPLICATION_JWT_EXPIRATION_SECONDS,
        "scope": "rooms:list rooms:create",
    }


def test_api_applications_generate_token_invalid_client_id():
    """Invalid client_id should return 401."""
    user = UserFactory(email="user@example.com")

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": "invalid-client-id",
            "client_secret": "some-secret",
            "grant_type": "client_credentials",
            "scope": user.email,
        },
        format="json",
    )

    assert response.status_code == 401
    assert "Invalid credentials" in str(response.data)


def test_api_applications_generate_token_invalid_client_secret():
    """Invalid client_secret should return 401."""
    user = UserFactory(email="user@example.com")
    application = ApplicationFactory(active=True)

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": "wrong-secret",
            "grant_type": "client_credentials",
            "scope": user.email,
        },
        format="json",
    )

    assert response.status_code == 401
    assert "Invalid credentials" in str(response.data)


def test_api_applications_generate_token_inactive_application():
    """Inactive application should return 401."""
    user = UserFactory(email="user@example.com")
    application = ApplicationFactory(active=False)

    plain_secret = "test-secret-123"
    application.client_secret = plain_secret
    application.save()

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": user.email,
        },
        format="json",
    )

    assert response.status_code == 401
    assert "Application is inactive" in str(response.data)


def test_api_applications_generate_token_invalid_email_format():
    """Invalid email format should return 400."""
    application = ApplicationFactory(active=True)

    plain_secret = "test-secret-123"
    application.client_secret = plain_secret
    application.save()

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": "not-an-email",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "scope should be a valid email address." in str(response.data).lower()


def test_api_applications_generate_token_domain_not_authorized():
    """Application without domain authorization should return 403."""
    user = UserFactory(email="user@denied.com")
    application = ApplicationFactory(active=True)
    ApplicationDomainFactory(application=application, domain="allowed.com")

    plain_secret = "test-secret-123"
    application.client_secret = plain_secret
    application.save()

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": user.email,
        },
        format="json",
    )

    assert response.status_code == 403
    assert "not authorized for this email domain" in str(response.data)


def test_api_applications_generate_token_domain_authorized():
    """Application with domain authorization should succeed."""
    user = UserFactory(email="user@allowed.com")
    application = ApplicationFactory(
        active=True,
        scopes=[ApplicationScope.ROOMS_LIST],
    )
    ApplicationDomainFactory(application=application, domain="allowed.com")

    plain_secret = "test-secret-123"
    application.client_secret = plain_secret
    application.save()

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": user.email,
        },
        format="json",
    )

    assert response.status_code == 200
    assert "access_token" in response.data


def test_api_applications_generate_token_user_not_found():
    """Non-existent user should return 404."""
    application = ApplicationFactory(active=True)

    plain_secret = "test-secret-123"
    application.client_secret = plain_secret
    application.save()

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": "nonexistent@example.com",
        },
        format="json",
    )

    assert response.status_code == 404
    assert "User not found" in str(response.data)


@freeze_time("2023-01-15 12:00:00")
def test_api_applications_token_payload_structure(settings):
    """Generated token should have correct payload structure."""
    user = UserFactory(email="user@example.com")

    application = ApplicationFactory(
        active=True,
        scopes=[ApplicationScope.ROOMS_LIST, ApplicationScope.ROOMS_CREATE],
    )

    plain_secret = "test-secret-123"
    application.client_secret = plain_secret
    application.save()

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": user.email,
        },
        format="json",
    )

    # Decode token to verify payload
    token = response.data["access_token"]
    payload = jwt.decode(
        token,
        settings.APPLICATION_JWT_SECRET_KEY,
        algorithms=[settings.APPLICATION_JWT_ALG],
        issuer=settings.APPLICATION_JWT_ISSUER,
        audience=settings.APPLICATION_JWT_AUDIENCE,
    )

    assert payload == {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "client_id": application.client_id,
        "exp": 1673787600,
        "iat": 1673784000,
        "user_id": str(user.id),
        "delegated": True,
        "scope": "rooms:list rooms:create",
    }


@freeze_time("2023-01-15 12:00:00")
def test_api_applications_token_new_user(settings):
    """Should create a new pending user when creation is allowed and user doesn't exist."""

    settings.APPLICATION_ALLOW_USER_CREATION = True
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True
    settings.OIDC_USER_SUB_FIELD_IMMUTABLE = False

    assert len(User.objects.all()) == 0

    application = ApplicationFactory(
        active=True,
        scopes=[ApplicationScope.ROOMS_LIST, ApplicationScope.ROOMS_CREATE],
    )

    plain_secret = "test-secret-123"
    application.client_secret = plain_secret
    application.save()

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": "unknown@world.com",
        },
        format="json",
    )

    # Decode token to verify payload
    token = response.data["access_token"]
    payload = jwt.decode(
        token,
        settings.APPLICATION_JWT_SECRET_KEY,
        algorithms=[settings.APPLICATION_JWT_ALG],
        issuer=settings.APPLICATION_JWT_ISSUER,
        audience=settings.APPLICATION_JWT_AUDIENCE,
    )

    user = User.objects.get(email="unknown@world.com")
    assert user.sub is None

    assert payload == {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "client_id": application.client_id,
        "exp": 1673787600,
        "iat": 1673784000,
        "user_id": str(user.id),
        "delegated": True,
        "scope": "rooms:list rooms:create",
    }


@freeze_time("2023-01-15 12:00:00")
def test_api_applications_token_existing_user(settings):
    """Application should not create a new user when user exist."""

    user = UserFactory(email="user@example.com")

    settings.APPLICATION_ALLOW_USER_CREATION = True
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True
    settings.OIDC_USER_SUB_FIELD_IMMUTABLE = False

    assert len(User.objects.all()) == 1

    application = ApplicationFactory(
        active=True,
        scopes=[ApplicationScope.ROOMS_LIST, ApplicationScope.ROOMS_CREATE],
    )

    plain_secret = "test-secret-123"
    application.client_secret = plain_secret
    application.save()

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": user.email,
        },
        format="json",
    )

    # Assert no new user was created
    assert len(User.objects.all()) == 1

    # Decode token to verify payload
    token = response.data["access_token"]
    payload = jwt.decode(
        token,
        settings.APPLICATION_JWT_SECRET_KEY,
        algorithms=[settings.APPLICATION_JWT_ALG],
        issuer=settings.APPLICATION_JWT_ISSUER,
        audience=settings.APPLICATION_JWT_AUDIENCE,
    )

    assert payload == {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "client_id": application.client_id,
        "exp": 1673787600,
        "iat": 1673784000,
        "user_id": str(user.id),
        "delegated": True,
        "scope": "rooms:list rooms:create",
    }
