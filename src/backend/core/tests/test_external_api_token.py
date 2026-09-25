"""
Tests for external API /token endpoint
"""

# pylint: disable=W0621

from unittest import mock
from urllib.parse import urlencode

from django.contrib.auth.hashers import check_password

import jwt
import pytest
from freezegun import freeze_time
from rest_framework.test import APIClient

from core import hashers
from core.factories import (
    ApplicationDomainFactory,
    ApplicationFactory,
    UserFactory,
)
from core.models import Application, ApplicationScope, User
from core.services import provisional_user_service

pytestmark = pytest.mark.django_db


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
    assert "Invalid credentials" in str(response.data)


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
    for field in ("client_id", "client_secret", "scope"):
        assert field in response.data


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
    assert "grant_type" in response.data


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
    assert "Invalid credentials" in str(response.data)


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
    assert "Invalid credentials" in str(response.data)


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
    assert "Invalid credentials" in str(response.data)


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
    assert "Application is inactive" in str(response.data)


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
    assert "Invalid credentials" in str(response.data)
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
    assert "scope should be a valid email address." in str(response.data).lower()


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
    assert "not authorized for this email domain" in str(response.data)


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
    assert "User not found" in str(response.data)


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
    """Should return 500 when ProvisionalUserIntegrityError is raised."""

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
