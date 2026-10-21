"""
Tests for external API /token endpoint
"""

# pylint: disable=W0621,too-many-lines

import json
from unittest import mock
from urllib.parse import urlencode

from django.contrib.auth.hashers import check_password

import jwt
import pytest
from freezegun import freeze_time
from rest_framework.test import APIClient

from core import hashers
from core.audit.testing import find_events
from core.factories import (
    ApplicationDomainFactory,
    ApplicationFactory,
    UserFactory,
)
from core.models import Application, ApplicationScope, User
from core.services import provisional_user_service

pytestmark = pytest.mark.django_db

INVALID_CREDENTIALS_ERROR = {
    "error": "invalid_client",
    "error_description": "Invalid credentials",
}


def test_api_applications_generate_token_application_disabled(settings):
    """When APPLICATION_ENABLED is False, the endpoint should return 404."""
    settings.APPLICATION_ENABLED = False

    user = UserFactory(email="user@example.com")
    plain_secret = "test-secret-123"
    application = ApplicationFactory(
        client_secret=plain_secret,
        is_active=True,
        scopes=[ApplicationScope.ROOMS_LIST],
    )

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

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found."}


def test_api_applications_generate_token_success(settings):
    """Valid credentials should return a JWT token."""
    UserFactory(email="User.Family@example.com")
    plain_secret = "test-secret-123"
    application = ApplicationFactory(
        client_secret=plain_secret,
        is_active=True,
        scopes=[ApplicationScope.ROOMS_LIST, ApplicationScope.ROOMS_CREATE],
    )

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


@pytest.mark.parametrize(
    "restricted", [True, False], ids=["restricted", "unrestricted"]
)
def test_api_applications_generate_token_success_query_count(
    restricted, django_assert_num_queries
):
    """An existing user needs one query each for application, domains, and user."""
    user = UserFactory(email="user@example.com")
    plain_secret = "test-secret-123"
    application = ApplicationFactory(client_secret=plain_secret)
    if restricted:
        ApplicationDomainFactory(application=application, domain="example.com")

    client = APIClient()
    with django_assert_num_queries(3):
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


def test_api_applications_generate_token_invalid_credentials_query_count(
    django_assert_num_queries,
):
    """An invalid secret must be rejected before querying domains or users."""
    application = ApplicationFactory(client_secret="test-secret-123")
    ApplicationDomainFactory(application=application, domain="example.com")

    client = APIClient()
    with django_assert_num_queries(1):
        response = client.post(
            "/external-api/v1.0/application/token/",
            {
                "client_id": application.client_id,
                "client_secret": "wrong-secret",
                "grant_type": "client_credentials",
                "scope": "user@example.com",
            },
            format="json",
        )

    assert response.status_code == 401
    assert response.json() == INVALID_CREDENTIALS_ERROR


def test_api_applications_generate_token_form_urlencoded(settings):
    """The token endpoint should accept "application/x-www-form-urlencoded"
    requests, as mandated by RFC 6749 (sections 3.2 and 4.4.2) for OAuth 2.0
    token endpoints, so that standard OAuth 2.0 client libraries work
    out of the box."""
    UserFactory(email="user@example.com")
    plain_secret = "test-secret-123"
    application = ApplicationFactory(
        client_secret=plain_secret,
        is_active=True,
        scopes=[ApplicationScope.ROOMS_LIST, ApplicationScope.ROOMS_CREATE],
    )

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        (
            f"client_id={application.client_id}"
            f"&client_secret={plain_secret}"
            "&grant_type=client_credentials"
            "&scope=user%40example.com"
        ),
        content_type="application/x-www-form-urlencoded",
    )

    assert response.status_code == 200
    assert "access_token" in response.data

    response.data.pop("access_token")

    assert response.data == {
        "token_type": "Bearer",
        "expires_in": settings.APPLICATION_JWT_EXPIRATION_SECONDS,
        "scope": "rooms:list rooms:create",
    }


def test_api_applications_generate_token_form_urlencoded_invalid_credentials():
    """Invalid credentials sent as form-urlencoded should be parsed and
    rejected with 401, proving the request body is properly decoded."""
    user = UserFactory(email="user@example.com")
    application = ApplicationFactory(is_active=True)

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        urlencode(
            {
                "client_id": application.client_id,
                "client_secret": "wrong-secret",
                "grant_type": "client_credentials",
                "scope": user.email,
            }
        ),
        content_type="application/x-www-form-urlencoded",
    )

    assert response.status_code == 401
    assert response.json() == INVALID_CREDENTIALS_ERROR


def test_api_applications_generate_token_form_urlencoded_missing_fields():
    """Missing required fields in a form-urlencoded request should return
    a 400 validation error, like for JSON requests."""
    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        urlencode({"grant_type": "client_credentials"}),
        content_type="application/x-www-form-urlencoded",
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": "invalid_client",
        "error_description": (
            "client_id : This field is required.; "
            "client_secret : This field is required.; "
            "scope : This field is required."
        ),
    }


def test_api_applications_generate_token_form_urlencoded_invalid_grant_type():
    """An unsupported grant_type sent as form-urlencoded should return 400."""
    user = UserFactory(email="user@example.com")
    plain_secret = "test-secret-123"
    application = ApplicationFactory(client_secret=plain_secret, is_active=True)

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        urlencode(
            {
                "client_id": application.client_id,
                "client_secret": plain_secret,
                "grant_type": "authorization_code",
                "scope": user.email,
            }
        ),
        content_type="application/x-www-form-urlencoded",
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": "unsupported_grant_type",
        "error_description": (
            "grant_type : 'authorization_code' is not a valid choice."
        ),
    }


def test_api_applications_generate_token_form_urlencoded_special_characters():
    """Percent-encoded reserved characters ("&", "=", "+", "%") in the
    client_secret should survive form-urlencoded decoding."""
    UserFactory(email="user@example.com")
    plain_secret = "s3cr3t&with=special+chars%42"
    application = ApplicationFactory(
        client_secret=plain_secret,
        is_active=True,
        scopes=[ApplicationScope.ROOMS_LIST],
    )

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        urlencode(
            {
                "client_id": application.client_id,
                "client_secret": plain_secret,
                "grant_type": "client_credentials",
                "scope": "user@example.com",
            }
        ),
        content_type="application/x-www-form-urlencoded",
    )

    assert response.status_code == 200
    assert "access_token" in response.data


def test_api_applications_generate_token_unsupported_media_type():
    """Content types other than JSON and form-urlencoded should still be
    rejected with 415 Unsupported Media Type."""
    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        "client_id=x&client_secret=y&grant_type=client_credentials&scope=a@b.co",
        content_type="text/plain",
    )

    assert response.status_code == 415
    assert response.json() == {
        "error": "invalid_request",
        "error_description": "Unsupported media type 'text/plain' in request.",
    }


def test_api_applications_generate_token_missing_fields():
    """Missing fields should return an RFC 6749 error listing every invalid
    field, reported as "invalid_client" when client credentials are missing."""
    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": "invalid_client",
        "error_description": (
            "client_id : This field is required.; "
            "client_secret : This field is required.; "
            "grant_type : This field is required.; "
            "scope : This field is required."
        ),
    }


def test_api_applications_generate_token_missing_grant_type():
    """A request with client credentials but no grant_type should return
    an "invalid_request" error."""
    user = UserFactory(email="user@example.com")
    plain_secret = "test-secret-123"
    application = ApplicationFactory(client_secret=plain_secret, is_active=True)

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "scope": user.email,
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": "invalid_request",
        "error_description": "grant_type : This field is required.",
    }


def test_api_applications_generate_token_error_description_charset():
    """Translated error descriptions should only contain the characters
    allowed by RFC 6749 section 5.2: printable ASCII, except double quotes
    and backslashes."""
    user = UserFactory(email="user@example.com")
    application = ApplicationFactory(is_active=True)

    response = _post_token(
        application.client_id, "", user.email, HTTP_ACCEPT_LANGUAGE="fr-fr"
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": "invalid_client",
        "error_description": "client_secret : Ce champ ne peut etre vide.",
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
    assert response.json() == INVALID_CREDENTIALS_ERROR


def test_api_applications_generate_token_invalid_client_secret():
    """Invalid client_secret should return 401."""
    user = UserFactory(email="user@example.com")
    application = ApplicationFactory(is_active=True)

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
    assert response.json() == INVALID_CREDENTIALS_ERROR


def test_token_unknown_client_id_with_valid_secret():
    """A valid secret cannot authenticate an unknown client ID."""
    secret = "application-a-secret"
    ApplicationFactory(client_secret=secret)
    user = UserFactory()

    response = APIClient().post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": "unknown-client-id",
            "client_secret": secret,
            "grant_type": "client_credentials",
            "scope": user.email,
        },
        format="json",
    )

    assert response.status_code == 401
    assert response.json() == INVALID_CREDENTIALS_ERROR


def test_token_rejects_secret_owned_by_another_application():
    """Application A's secret cannot authenticate application B."""
    secret_a = "application-a-secret"
    ApplicationFactory(client_secret=secret_a)
    application_b = ApplicationFactory(client_secret="application-b-secret")
    user = UserFactory()

    response = APIClient().post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application_b.client_id,
            "client_secret": secret_a,
            "grant_type": "client_credentials",
            "scope": user.email,
        },
        format="json",
    )

    assert response.status_code == 401
    assert response.json() == INVALID_CREDENTIALS_ERROR


def test_api_applications_generate_token_inactive_application():
    """Inactive application should return 401."""
    user = UserFactory(email="user@example.com")
    plain_secret = "test-secret-123"
    application = ApplicationFactory(client_secret=plain_secret, is_active=False)

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
    assert response.json() == {
        "error": "invalid_client",
        "error_description": "Application is inactive",
    }


def test_api_applications_generate_token_inactive_application_wrong_secret():
    """An inactive application with a wrong secret should return 401."""
    user = UserFactory(email="user@example.com")
    application = ApplicationFactory(is_active=False)

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
    assert response.json() == INVALID_CREDENTIALS_ERROR
    assert "inactive" not in str(response.data).lower()


def test_api_applications_generate_token_invalid_email_format():
    """Invalid email format should return 400."""
    plain_secret = "test-secret-123"
    application = ApplicationFactory(client_secret=plain_secret, is_active=True)

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
    assert response.json() == {
        "error": "invalid_scope",
        "error_description": "Scope should be a valid email address.",
    }


def test_api_applications_generate_token_domain_not_authorized():
    """Application without domain authorization should return 403."""
    user = UserFactory(email="user@denied.com")
    plain_secret = "test-secret-123"
    application = ApplicationFactory(client_secret=plain_secret, is_active=True)
    ApplicationDomainFactory(application=application, domain="allowed.com")

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
    assert response.json() == {
        "error": "invalid_scope",
        "error_description": (
            "This application is not authorized for this email domain."
        ),
    }


def test_api_applications_generate_token_domain_authorized():
    """Application with domain authorization should succeed."""
    user = UserFactory(email="user@allowed.com")
    plain_secret = "test-secret-123"
    application = ApplicationFactory(
        client_secret=plain_secret,
        is_active=True,
        scopes=[ApplicationScope.ROOMS_LIST],
    )
    ApplicationDomainFactory(application=application, domain="allowed.com")

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
    plain_secret = "test-secret-123"
    application = ApplicationFactory(client_secret=plain_secret, is_active=True)

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
    assert response.json() == {
        "error": "invalid_scope",
        "error_description": "User not found.",
    }


@freeze_time("2023-01-15 12:00:00")
def test_api_applications_token_payload_structure(settings):
    """Generated token should have correct payload structure."""
    user = UserFactory(email="user@example.com")

    plain_secret = "test-secret-123"
    application = ApplicationFactory(
        client_secret=plain_secret,
        is_active=True,
        scopes=[ApplicationScope.ROOMS_LIST, ApplicationScope.ROOMS_CREATE],
    )

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

    plain_secret = "test-secret-123"
    application = ApplicationFactory(
        client_secret=plain_secret,
        is_active=True,
        scopes=[ApplicationScope.ROOMS_LIST, ApplicationScope.ROOMS_CREATE],
    )

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

    plain_secret = "test-secret-123"
    application = ApplicationFactory(
        client_secret=plain_secret,
        is_active=True,
        scopes=[ApplicationScope.ROOMS_LIST, ApplicationScope.ROOMS_CREATE],
    )

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


@mock.patch.object(provisional_user_service.ProvisionalUserService, "_get_by_email")
def test_api_applications_token_new_user_race_condition(mock_get_by_email, settings):
    """Should handle race condition where two concurrent requests create the same user."""
    settings.APPLICATION_ALLOW_USER_CREATION = True
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True
    settings.OIDC_USER_SUB_FIELD_IMMUTABLE = False

    plain_secret = "test-secret-123"
    application = ApplicationFactory(
        client_secret=plain_secret, is_active=True, scopes=[ApplicationScope.ROOMS_LIST]
    )

    email = "john.doe@example.com"

    # First call: lie and say user doesn't exist, simulating the race window
    # Second call (recovery path): return the real user
    existing_user = UserFactory(sub=None, email=email)
    mock_get_by_email.side_effect = [None, existing_user]

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": email,
        },
        format="json",
    )

    assert response.status_code == 200
    assert mock_get_by_email.call_count == 2

    token = response.data["access_token"]
    payload = jwt.decode(
        token,
        settings.APPLICATION_JWT_SECRET_KEY,
        algorithms=[settings.APPLICATION_JWT_ALG],
        issuer=settings.APPLICATION_JWT_ISSUER,
        audience=settings.APPLICATION_JWT_AUDIENCE,
    )
    assert payload["user_id"] == str(existing_user.id)
    assert User.objects.filter(email=email).count() == 1


@mock.patch.object(
    provisional_user_service.ProvisionalUserService,
    "get_or_create",
    side_effect=provisional_user_service.ProvisionalUserIntegrityError,
)
def test_api_applications_token_new_user_race_condition_unrecoverable(
    mock_get_or_create, settings
):
    """Should return 409 when ProvisionalUserIntegrityError is raised."""

    settings.APPLICATION_ALLOW_USER_CREATION = True
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True
    settings.OIDC_USER_SUB_FIELD_IMMUTABLE = False

    plain_secret = "test-secret-123"
    application = ApplicationFactory(
        client_secret=plain_secret, is_active=True, scopes=[ApplicationScope.ROOMS_LIST]
    )

    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": application.client_id,
            "client_secret": plain_secret,
            "grant_type": "client_credentials",
            "scope": "john.doe@example.com",
        },
        format="json",
    )

    assert response.status_code == 409
    assert response.json() == {
        "error": "server_error",
        "error_description": "Failed to create or retrieve provisional user.",
    }
    assert mock_get_or_create.call_count == 1


def test_token_populates_fast_hash_and_stops_using_legacy_hash():
    """First login migrates; subsequent logins use only the fast hash."""
    secret = "application-secret"

    application = ApplicationFactory(client_secret=secret)
    Application.objects.filter(pk=application.pk).update(client_secret_sha256=None)
    application.refresh_from_db()

    original_hash = application.client_secret

    user = UserFactory()
    payload = {
        "client_id": application.client_id,
        "client_secret": secret,
        "grant_type": "client_credentials",
        "scope": user.email,
    }
    client = APIClient()

    with mock.patch.object(
        hashers, "check_password", wraps=hashers.check_password
    ) as legacy_verifier:
        response = client.post(
            "/external-api/v1.0/application/token/", payload, format="json"
        )

    assert response.status_code == 200
    legacy_verifier.assert_called_once_with(secret, original_hash)

    application.refresh_from_db()

    migrated_hash = application.client_secret_sha256
    assert hashers.CLIENT_SECRET_HASH_PATTERN.fullmatch(migrated_hash)
    assert hashers.verify_client_secret(secret, migrated_hash)
    assert application.client_secret == original_hash

    # Fail immediately if a subsequent login tries the legacy verifier.
    with mock.patch.object(
        hashers,
        "check_password",
        side_effect=AssertionError("Legacy hash must no longer be used"),
    ):
        response = client.post(
            "/external-api/v1.0/application/token/", payload, format="json"
        )

    assert response.status_code == 200
    application.refresh_from_db()
    assert application.client_secret_sha256 == migrated_hash
    assert application.client_secret == original_hash


def test_token_failed_login_leaves_legacy_credentials_untouched():
    """An incorrect secret neither migrates nor changes the legacy hash."""

    application = ApplicationFactory(client_secret="application-secret")
    Application.objects.filter(pk=application.pk).update(client_secret_sha256=None)
    application.refresh_from_db()

    original_hash = application.client_secret
    user = UserFactory()

    response = APIClient().post(
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
    application.refresh_from_db()
    assert application.client_secret == original_hash
    assert application.client_secret_sha256 is None


def test_token_concurrent_successful_logins_preserve_first_migration():
    """Both logins succeed; the later migration preserves the first hash."""
    secret = "application-secret"
    application = ApplicationFactory(client_secret=secret)
    Application.objects.filter(pk=application.pk).update(client_secret_sha256=None)
    application.refresh_from_db()

    original_hash = application.client_secret
    user = UserFactory()
    payload = {
        "client_id": application.client_id,
        "client_secret": secret,
        "grant_type": "client_credentials",
        "scope": user.email,
    }
    legacy_verifier = hashers.check_password
    winning_hashes = []

    def verify_then_complete_other_login(raw_secret, encoded):
        verified = legacy_verifier(raw_secret, encoded)

        # Complete another login before this request writes its migration.
        # Restore the real verifier to avoid recursively invoking this callback.
        with mock.patch.object(hashers, "check_password", new=legacy_verifier):
            other_response = APIClient().post(
                "/external-api/v1.0/application/token/", payload, format="json"
            )

        assert other_response.status_code == 200
        application.refresh_from_db()
        winning_hashes.append(application.client_secret_sha256)
        return verified

    with mock.patch.object(
        hashers, "check_password", side_effect=verify_then_complete_other_login
    ) as verifier:
        response = APIClient().post(
            "/external-api/v1.0/application/token/", payload, format="json"
        )

    assert response.status_code == 200
    verifier.assert_called_once_with(secret, original_hash)
    application.refresh_from_db()
    assert application.client_secret_sha256 == winning_hashes[0]
    assert hashers.verify_client_secret(secret, application.client_secret_sha256)
    assert application.client_secret == original_hash


def test_token_authenticates_after_rollback():
    """Legacy authentication still works after the fast hash is discarded."""
    secret = "application-secret"
    application = ApplicationFactory(client_secret=secret)
    Application.objects.filter(pk=application.pk).update(client_secret_sha256=None)
    application.refresh_from_db()

    original_hash = application.client_secret

    user = UserFactory()
    payload = {
        "client_id": application.client_id,
        "client_secret": secret,
        "grant_type": "client_credentials",
        "scope": user.email,
    }
    client = APIClient()

    # Authenticate with the new implementation and migrate the hash.
    response = client.post(
        "/external-api/v1.0/application/token/", payload, format="json"
    )

    assert response.status_code == 200

    application.refresh_from_db()

    assert hashers.verify_client_secret(secret, application.client_secret_sha256)
    assert application.client_secret == original_hash

    Application.objects.filter(pk=application.pk).update(client_secret_sha256=None)

    def legacy_check(instance, raw_secret):
        return check_password(raw_secret, instance.client_secret)

    # Simulate the old release's verification using only the legacy field.
    with mock.patch.object(
        Application,
        "check_client_secret",
        autospec=True,
        side_effect=legacy_check,
    ) as verifier:
        response = client.post(
            "/external-api/v1.0/application/token/", payload, format="json"
        )

    assert response.status_code == 200
    verifier.assert_called_once()
    application.refresh_from_db()
    assert application.client_secret == original_hash
    assert application.client_secret_sha256 is None


def _application(**kwargs):
    """Create an application whose plain secret is ``test-secret-123``."""
    kwargs.setdefault("is_active", True)
    return ApplicationFactory(client_secret="test-secret-123", **kwargs)


def _post_token(client_id, client_secret, scope, **extra):
    """Post a client-credentials token request."""
    return APIClient().post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "client_credentials",
            "scope": scope,
        },
        format="json",
        **extra,
    )


def test_api_applications_generate_token_success_is_audited(audit_events, settings):
    """An issued token records the application, the delegated user and scopes."""
    user = UserFactory(email="jean-neige@winterfell.com")
    application = _application(scopes=[ApplicationScope.ROOMS_LIST])

    response = _post_token(
        application.client_id,
        "test-secret-123",
        "jean-neige@winterfell.com",
        REMOTE_ADDR="1.2.3.4",
    )

    assert response.status_code == 200
    [event] = find_events(audit_events, "application.token.issue")

    assert event["event"]["category"] == ["authentication"]
    assert event["event"]["type"] == ["start"]
    assert event["event"]["outcome"] == "success"
    assert event["lasuite"]["actor"] == {"type": "application", "sub": user.sub}
    assert event["lasuite"]["auth"] == {"method": "client_credentials"}
    assert event["lasuite"]["application"] == {"client_id": application.client_id}
    assert event["user"] == {"id": str(user.pk), "domain": "winterfell.com"}
    assert event["organization"] == {"id": application.client_id}
    assert event["entity"]["target"] == {
        "id": str(application.pk),
        "type": ["application"],
        "sub_type": "application",
        "name": application.name,
        "raw": {
            "client_id": application.client_id,
            "is_active": True,
            "scopes": ["rooms:list"],
        },
    }
    assert event["http"]["response"] == {"status_code": 200}
    assert event["lasuite"]["details"] == {
        "scopes": ["rooms:list"],
        "user_provisioned": False,
        "expires_in": settings.APPLICATION_JWT_EXPIRATION_SECONDS,
    }
    assert event["client"]["ip"] == "1.2.3.4"
    assert event["url"]["path"] == "/external-api/v1.0/application/token/"
    assert event["http"]["request"]["id"] == response["X-Request-ID"]
    assert "jean-neige@winterfell.com" not in json.dumps(event)


def test_api_applications_generate_token_wrong_secret_is_audited(audit_events):
    """A wrong secret is a denial: the submitted client id is only a claim."""
    UserFactory(email="jean-neige@winterfell.com")
    application = _application()

    response = _post_token(application.client_id, "wrong-secret", "user@example.com")

    assert response.status_code == 401

    [event] = find_events(audit_events, "application.token.issue")

    assert event["event"]["category"] == ["authentication"]
    # ECS expects no ``denied`` type for an authentication
    assert event["event"]["type"] == ["start"]
    assert event["event"]["reason"] == "authentication_failed"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["actor"] == {"type": "anonymous"}
    assert event["lasuite"]["auth"] == {"method": "client_credentials"}
    assert "application" not in event["lasuite"]
    assert "organization" not in event
    assert event["lasuite"]["details"] == {
        "requested_domain": "example.com",
        "claimed_client_id": application.client_id,
    }
    assert "target" not in event["lasuite"]
    assert event["http"]["response"] == {"status_code": 401}
    assert event["error"] == {"message": "Invalid credentials"}
    assert event["log"]["level"] == "warning"
    assert "jean-neige@winterfell.com" not in json.dumps(event)


def test_api_applications_generate_token_unknown_client_is_audited(audit_events):
    """An unknown client id is still recorded, so brute force is visible."""
    response = _post_token("does-not-exist", "whatever", "jean-neige@winterfell.com")

    assert response.status_code == 401

    [event] = find_events(audit_events, "application.token.issue")

    assert event["event"]["reason"] == "authentication_failed"
    assert event["lasuite"]["details"]["claimed_client_id"] == "does-not-exist"
    assert "application" not in event["lasuite"]
    assert "organization" not in event


def test_api_applications_generate_token_inactive_application_is_audited(
    audit_events,
):
    """A disabled application is refused with an explicit message."""
    UserFactory(email="jean-neige@winterfell.com")
    application = _application(is_active=False)

    response = _post_token(
        application.client_id, "test-secret-123", "jean-neige@winterfell.com"
    )

    assert response.status_code == 401
    [event] = find_events(audit_events, "application.token.issue")

    assert event["event"]["reason"] == "authentication_failed"
    assert event["error"] == {"message": "Application is inactive"}


def test_api_applications_generate_token_domain_denied_is_audited(audit_events):
    """Delegating outside the allowed domains is a permission denial."""
    UserFactory(email="user@random.com")
    application = _application()
    ApplicationDomainFactory(application=application, domain="allowed.com")

    response = _post_token(application.client_id, "test-secret-123", "user@random.com")

    assert response.status_code == 403

    [event] = find_events(audit_events, "application.token.issue")

    assert event["event"]["reason"] == "permission_denied"
    assert event["lasuite"]["actor"] == {"type": "application"}
    assert event["entity"]["target"]["id"] == str(application.pk)
    assert event["lasuite"]["details"] == {"requested_domain": "random.com"}
    assert event["http"]["response"] == {"status_code": 403}
    assert event["error"] == {
        "message": "This application is not authorized for this email domain."
    }


def test_api_applications_generate_token_invalid_email_is_audited(audit_events):
    """An invalid scope is a validation failure by an authenticated application."""
    application = _application()

    response = _post_token(application.client_id, "test-secret-123", "not-an-email")

    assert response.status_code == 400

    [event] = find_events(audit_events, "application.token.issue")

    assert event["event"]["reason"] == "validation_error"
    assert event["lasuite"]["actor"] == {"type": "application"}
    assert event["http"]["response"] == {"status_code": 400}
    assert event["error"] == {"message": "Scope should be a valid email address."}
    assert "details" not in event["lasuite"]


def test_api_applications_generate_token_unknown_user_is_audited(audit_events):
    """An unknown user with provisioning disabled is a not-found denial."""
    application = _application()

    response = _post_token(
        application.client_id, "test-secret-123", "nobody@example.com"
    )

    assert response.status_code == 404

    [event] = find_events(audit_events, "application.token.issue")

    assert event["event"]["reason"] == "not_found"
    assert event["lasuite"]["details"] == {"requested_domain": "example.com"}
    assert event["http"]["response"] == {"status_code": 404}
    assert event["error"] == {"message": "User not found."}


def test_api_applications_generate_token_provisioning_is_audited(
    audit_events, settings
):
    """Provisioning a user is its own event, correlated with the token issue."""
    settings.APPLICATION_ALLOW_USER_CREATION = True
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True
    settings.OIDC_USER_SUB_FIELD_IMMUTABLE = False
    application = _application(scopes=[ApplicationScope.ROOMS_LIST])

    response = _post_token(
        application.client_id, "test-secret-123", "new.user@example.com"
    )

    assert response.status_code == 200

    user = User.objects.get(email="new.user@example.com")
    [provision] = find_events(audit_events, "user.provision")

    assert provision["event"]["category"] == ["iam"]
    assert provision["event"]["type"] == ["user", "creation"]
    assert provision["lasuite"]["actor"] == {"type": "application"}
    # Same mechanism as the token issue it belongs to
    assert provision["lasuite"]["auth"] == {"method": "client_credentials"}
    assert provision["lasuite"]["application"] == {"client_id": application.client_id}
    assert provision["entity"]["target"] == {
        "id": str(user.pk),
        "type": ["user"],
        "sub_type": "user",
    }
    assert provision["user"]["target"] == {"id": str(user.pk), "domain": "example.com"}
    assert provision["http"]["request"]["id"] == response["X-Request-ID"]
    assert provision["url"]["path"] == "/external-api/v1.0/application/token/"
    assert "new.user@example.com" not in json.dumps(provision)

    [issue] = find_events(audit_events, "application.token.issue")
    assert issue["lasuite"]["details"]["user_provisioned"] is True
    assert issue["user"]["id"] == str(user.pk)
