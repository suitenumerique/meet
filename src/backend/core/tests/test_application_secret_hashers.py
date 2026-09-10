"""Application hashing and migration of existing credentials."""

import hashlib
from unittest import mock

from django.contrib.auth.hashers import check_password, identify_hasher, make_password
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils.crypto import get_random_string

import pytest
from rest_framework.test import APIClient

from core import hashers
from core.factories import ApplicationFactory, UserFactory
from core.models import Application

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("secret", ["short", "a" * 128, b"byte-secret"])
def test_application_hash(secret):
    """Application hashes verify correctly but are not accepted for user passwords."""
    encoded = hashers.hash_client_secret(secret)
    raw = secret.encode() if isinstance(secret, str) else secret
    algorithm, salt, digest = encoded.split("$")
    assert algorithm == "sha256"
    assert len(salt) == 22
    assert digest == hashlib.sha256(salt.encode() + raw).hexdigest()
    assert hashers.hash_client_secret(secret) != encoded
    assert hashers.verify_client_secret(secret, encoded)
    assert not hashers.verify_client_secret("wrong", encoded)
    assert not hashers.verify_client_secret(None, encoded)
    assert not hashers.verify_client_secret(secret, "sha256$invalid")
    assert not check_password(secret, encoded)
    with pytest.raises(ValueError):
        identify_hasher(encoded)
    assert not make_password(raw.decode()).startswith("sha256$")


@pytest.mark.parametrize("algorithm", ["pbkdf2_sha256", "md5"])
def test_token_migrates_legacy_secret_once(algorithm):
    """The same client secret works before and after migration, with no later writes."""
    secret = get_random_string(128)
    user = UserFactory()
    legacy = make_password(secret, hasher=algorithm)
    app = ApplicationFactory(client_secret=legacy)
    app.refresh_from_db()

    assert app.client_secret == legacy
    assert app.client_secret_sha256 is None
    payload = {
        "client_id": app.client_id,
        "client_secret": secret,
        "grant_type": "client_credentials",
        "scope": user.email,
    }
    client = APIClient()
    response = client.post(
        "/external-api/v1.0/application/token/", payload, format="json"
    )
    assert response.status_code == 200
    app.refresh_from_db()
    migrated = app.client_secret_sha256
    assert check_password(secret, app.client_secret)
    assert hashers.CLIENT_SECRET_HASH_PATTERN.fullmatch(migrated)["salt"]
    assert hashers.verify_client_secret(secret, migrated)
    with CaptureQueriesContext(connection) as queries:
        response = client.post(
            "/external-api/v1.0/application/token/", payload, format="json"
        )
    assert response.status_code == 200
    assert not any(q["sql"].lstrip().startswith("UPDATE") for q in queries)
    app.refresh_from_db()
    assert app.client_secret_sha256 == migrated
    assert app.client_secret == legacy


def test_wrong_secret_does_not_migrate():
    """Failed authentication leaves a production PBKDF2 hash untouched."""
    user = UserFactory()
    legacy = make_password(get_random_string(128), hasher="pbkdf2_sha256")
    app = ApplicationFactory(client_secret=legacy)
    response = APIClient().post(
        "/external-api/v1.0/application/token/",
        {
            "client_id": app.client_id,
            "client_secret": "wrong",
            "grant_type": "client_credentials",
            "scope": user.email,
        },
        format="json",
    )
    assert response.status_code == 401
    app.refresh_from_db()
    assert app.client_secret == legacy
    assert app.client_secret_sha256 is None


def test_migration_preserves_concurrent_rotation():
    """Migration must not restore a secret rotated after verification."""
    secret = get_random_string(128)
    app = ApplicationFactory(
        client_secret=make_password(secret, hasher="pbkdf2_sha256")
    )
    replacement = make_password(get_random_string(128), hasher="pbkdf2_sha256")

    def verify_then_rotate(raw, encoded):
        verified = check_password(raw, encoded)
        Application.objects.filter(pk=app.pk).update(client_secret=replacement)
        return verified

    with mock.patch.object(hashers, "check_password", side_effect=verify_then_rotate):
        assert app.check_client_secret(secret) is False

    app.refresh_from_db()
    assert app.client_secret == replacement
    assert app.client_secret_sha256 is None


def test_migration_preserves_concurrent_migration():
    """Authentication succeeds when another request migrates the same secret."""
    secret = get_random_string(128)
    app = ApplicationFactory(
        client_secret=make_password(secret, hasher="pbkdf2_sha256")
    )
    migrated = hashers.hash_client_secret(secret)

    def verify_then_migrate(raw, encoded):
        verified = check_password(raw, encoded)
        Application.objects.filter(pk=app.pk).update(client_secret_sha256=migrated)
        return verified

    with mock.patch.object(hashers, "check_password", side_effect=verify_then_migrate):
        assert app.check_client_secret(secret) is True

    app.refresh_from_db()
    assert app.client_secret_sha256 == migrated


def test_migration_preserves_concurrent_deletion():
    """Authentication fails when the application is deleted after verification."""
    secret = get_random_string(128)
    app = ApplicationFactory(
        client_secret=make_password(secret, hasher="pbkdf2_sha256")
    )

    def verify_then_delete(raw, encoded):
        verified = check_password(raw, encoded)
        Application.objects.filter(pk=app.pk).delete()
        return verified

    with mock.patch.object(hashers, "check_password", side_effect=verify_then_delete):
        assert app.check_client_secret(secret) is False

    assert not Application.objects.filter(pk=app.pk).exists()


@pytest.mark.parametrize(
    "secret",
    [
        "sha256$my-secret",
        "sha256$" + "a" * 63,
        "sha256$" + "a" * 64,
        "sha256$" + "g" * 64,
        "sha256$" + "a" * 64 + "\n",
        "sha256$$" + "a" * 64,
        "sha256$short$" + "a" * 64,
        "sha256$" + "b" * 22 + "$" + "g" * 64,
    ],
)
def test_prefixed_plaintext_is_hashed(secret):
    """A prefix alone must not cause a raw secret to bypass hashing."""
    assert not hashers.CLIENT_SECRET_HASH_PATTERN.fullmatch(secret)
    app = ApplicationFactory(client_secret=secret)
    app.refresh_from_db()
    encoded = app.client_secret_sha256
    assert encoded != secret
    assert hashers.CLIENT_SECRET_HASH_PATTERN.fullmatch(encoded)["salt"]
    assert app.check_client_secret(secret)
    app.name = "Updated application"
    app.save()
    app.refresh_from_db()
    assert app.client_secret_sha256 == encoded


def test_unsalted_secret_is_rejected():
    """Only salted SHA-256 hashes are accepted."""
    secret = get_random_string(128)
    encoded = f"sha256${hashlib.sha256(secret.encode()).hexdigest()}"

    assert hashers.CLIENT_SECRET_HASH_PATTERN.fullmatch(encoded) is None
    assert not hashers.verify_client_secret(secret, encoded)


def test_new_application_supports_legacy_verification(settings):
    """A rollback can authenticate applications created by the new release."""
    settings.PASSWORD_HASHERS = [
        "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    ]
    secret = get_random_string(128)
    app = ApplicationFactory(client_secret=secret)
    app.refresh_from_db()
    assert app.client_secret.startswith("pbkdf2_sha256$")
    assert check_password(secret, app.client_secret)
    assert hashers.verify_client_secret(secret, app.client_secret_sha256)
    with mock.patch.object(hashers, "check_password", side_effect=AssertionError):
        assert app.check_client_secret(secret)
        assert not app.check_client_secret("wrong")


def test_unrelated_save_preserves_both_hashes():
    """Saving an application's metadata does not change either credential hash."""
    app = ApplicationFactory()
    original = (app.client_secret, app.client_secret_sha256)
    app.name = "Renamed"
    app.save()
    app.refresh_from_db()
    assert (app.client_secret, app.client_secret_sha256) == original


def test_creation_with_legacy_hash_defers_fast_hash_until_login():
    """An imported Django hash is preserved, never treated as the raw secret."""
    secret = get_random_string(128)
    legacy = make_password(secret, hasher="pbkdf2_sha256")
    app = ApplicationFactory(client_secret=legacy)
    app.refresh_from_db()
    assert app.client_secret == legacy
    assert app.client_secret_sha256 is None
    assert not app.check_client_secret(legacy)
    assert app.check_client_secret(secret)
    app.refresh_from_db()
    assert app.client_secret == legacy
    assert hashers.verify_client_secret(secret, app.client_secret_sha256)


def test_metadata_only_save_does_not_rotate_secret():
    """A secret excluded from update_fields must not change either stored hash."""
    app = ApplicationFactory()
    original = (app.client_secret, app.client_secret_sha256)
    app.client_secret = get_random_string(128)
    app.name = "Renamed"
    app.save(update_fields=["name"])
    app.refresh_from_db()
    assert (app.client_secret, app.client_secret_sha256) == original


def test_empty_update_fields_does_not_rotate_secret():
    """Django's explicit no-op save must not update either credential field."""
    app = ApplicationFactory()
    original = (app.client_secret, app.client_secret_sha256)
    app.client_secret = get_random_string(128)
    with CaptureQueriesContext(connection) as queries:
        app.save(update_fields=[])
    assert not any(q["sql"].lstrip().startswith("UPDATE") for q in queries)
    app.refresh_from_db()
    assert (app.client_secret, app.client_secret_sha256) == original


def test_creation_with_salted_hash_skips_fast_hash():
    """An existing salted hash must not be hashed again as plaintext."""
    encoded = hashers.hash_client_secret(get_random_string(128))
    app = ApplicationFactory(client_secret=encoded)
    app.refresh_from_db()
    assert app.client_secret == encoded
    assert app.client_secret_sha256 is None
