"""Unit tests for the Authentication Backends."""

from unittest import mock

from django.core.exceptions import ImproperlyConfigured, SuspiciousOperation

import pytest

from core import models
from core.authentication.backends import OIDCAuthenticationBackend
from core.factories import UserFactory
from core.services import marketing

pytestmark = pytest.mark.django_db


def test_authentication_getter_existing_user(monkeypatch):
    """
    If an existing user matches, the user should be returned.
    """

    klass = OIDCAuthenticationBackend()
    db_user = UserFactory(email="foo@mail.com")

    def get_userinfo_mocked(*args):
        return {"sub": db_user.sub, "email": "some@mail.com"}

    def get_existing_user(*args):
        return db_user

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)
    monkeypatch.setattr(
        OIDCAuthenticationBackend, "get_existing_user", get_existing_user
    )

    user = klass.get_or_create_user(
        access_token="test-token", id_token=None, payload=None
    )

    assert user == db_user


def test_authentication_getter_new_user_no_email(monkeypatch):
    """
    If no user matches, a user should be created.
    User's info doesn't contain an email, created user's email should be empty.
    """
    klass = OIDCAuthenticationBackend()

    def get_userinfo_mocked(*args):
        return {"sub": "123"}

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    user = klass.get_or_create_user(
        access_token="test-token", id_token=None, payload=None
    )

    assert user.sub == "123"
    assert user.email is None
    assert user.password == "!"
    assert models.User.objects.count() == 1


def test_authentication_getter_new_user_with_email(monkeypatch):
    """
    If no user matches, a user should be created.
    User's info contains an email, created user's email should be filled.
    """
    klass = OIDCAuthenticationBackend()

    email = "meet@example.com"

    def get_userinfo_mocked(*args):
        return {"sub": "123", "email": email}

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    user = klass.get_or_create_user(
        access_token="test-token", id_token=None, payload=None
    )

    assert user.sub == "123"
    assert user.email == email
    assert user.full_name is None
    assert user.short_name is None
    assert user.password == "!"
    assert models.User.objects.count() == 1


@pytest.mark.parametrize("email", [None, "johndoe@foo.com"])
def test_authentication_getter_new_user_with_names(monkeypatch, email):
    """
    If no user matches, a user should be created.
    User's info contains name-related field, created user's full and short names should be filled,
    whether the email is filled
    """
    klass = OIDCAuthenticationBackend()

    def get_userinfo_mocked(*args):
        return {"sub": "123", "given_name": "John", "usual_name": "Doe", "email": email}

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    user = klass.get_or_create_user(
        access_token="test-token", id_token=None, payload=None
    )

    assert user.sub == "123"
    assert user.email == email
    assert user.full_name == "John Doe"
    assert user.short_name == "John"
    assert user.password == "!"
    assert models.User.objects.count() == 1


def test_models_oidc_user_getter_invalid_token(django_assert_num_queries, monkeypatch):
    """The user's info doesn't contain a sub."""
    klass = OIDCAuthenticationBackend()

    def get_userinfo_mocked(*args):
        return {
            "test": "123",
        }

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    with (
        django_assert_num_queries(0),
        pytest.raises(
            SuspiciousOperation,
            match="User info contained no recognizable user identification",
        ),
    ):
        klass.get_or_create_user(access_token="test-token", id_token=None, payload=None)

    assert models.User.objects.exists() is False


def test_models_oidc_user_getter_empty_sub(django_assert_num_queries, monkeypatch):
    """The user's info contains a sub, but it's an empty string."""
    klass = OIDCAuthenticationBackend()

    def get_userinfo_mocked(*args):
        return {"test": "123", "sub": ""}

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    with (
        django_assert_num_queries(0),
        pytest.raises(
            SuspiciousOperation,
            match="User info contained no recognizable user identification",
        ),
    ):
        klass.get_or_create_user(access_token="test-token", id_token=None, payload=None)

    assert models.User.objects.exists() is False


def test_authentication_get_inactive_user(monkeypatch):
    """Test an exception is raised when attempting to authenticate inactive user."""

    klass = OIDCAuthenticationBackend()
    db_user = UserFactory(is_active=False)

    def get_userinfo_mocked(*args):
        return {"sub": db_user.sub}

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    with (
        pytest.raises(
            SuspiciousOperation,
            match="User account is disabled",
        ),
    ):
        klass.get_or_create_user(access_token="test-token", id_token=None, payload=None)


def test_finds_user_by_sub(django_assert_num_queries):
    """Should return user when found by sub, and email is matching."""

    klass = OIDCAuthenticationBackend()
    db_user = UserFactory(email="foo@mail.com")

    with django_assert_num_queries(1):
        user = klass.get_existing_user(db_user.sub, db_user.email)

    assert user == db_user


def test_finds_user_when_email_fallback_disabled(django_assert_num_queries, settings):
    """Should not return a user when not found by sub, and email fallback is disabled."""

    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = False

    klass = OIDCAuthenticationBackend()
    db_user = UserFactory(email="foo@mail.com")

    with django_assert_num_queries(1):
        user = klass.get_existing_user("wrong-sub", db_user.email)

    assert user is None


def test_finds_user_when_email_is_none(django_assert_num_queries, settings):
    """Should not return a user when not found by sub, and email is empty."""

    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True

    klass = OIDCAuthenticationBackend()
    UserFactory(email="foo@mail.com")

    empty_email = ""

    with django_assert_num_queries(1):
        user = klass.get_existing_user("wrong-sub", empty_email)

    assert user is None


def test_finds_user_by_email(django_assert_num_queries, settings):
    """Should return user when found by email, and sub is not matching."""

    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True

    klass = OIDCAuthenticationBackend()
    db_user = UserFactory(email="foo@mail.com")

    with django_assert_num_queries(2):
        user = klass.get_existing_user("wrong-sub", db_user.email)

    assert user == db_user


def test_finds_user_case_insensitive_email(django_assert_num_queries, settings):
    """Should match email case-insensitively when falling back to email."""
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True

    klass = OIDCAuthenticationBackend()
    db_user = UserFactory(email="foo@mail.com")

    with django_assert_num_queries(2):
        user = klass.get_existing_user("wrong-sub", "FOO@MAIL.COM")

    assert user == db_user


def test_finds_user_multiple_users_same_email(django_assert_num_queries, settings):
    """Should handle multiple users with same email appropriately."""

    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True

    klass = OIDCAuthenticationBackend()
    email = "foo@mail.com"
    UserFactory(email=email)
    UserFactory(email=email)  # Second user with same email

    with (
        django_assert_num_queries(2),
        pytest.raises(
            SuspiciousOperation,
            match="Multiple user accounts share a common email.",
        ),
    ):
        klass.get_existing_user("wrong-sub", email)


def test_finds_user_whitespace_email(django_assert_num_queries, settings):
    """Should not match emails with whitespace."""

    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True
    settings.OIDC_CREATE_USER = False

    klass = OIDCAuthenticationBackend()
    UserFactory(email="foo@mail.com")

    with django_assert_num_queries(2):
        user = klass.get_existing_user("wrong-sub", " foo@mail.com ")

    assert user is None


@pytest.mark.parametrize(
    "email",
    [
        "john.doe@ｅxample.com",  # Fullwidth character in domain
        "john.doe@еxample.com",  # Cyrillic 'е' in domain
        "JOHN.DOe@exam𝔭le.com",  # Mixed Gothic '𝔭' in domain
        "john.doe@exаmple.com",  # Cyrillic 'а' (a) in domain
        "john.doe@ｅ𝓧𝓪𝓶𝓹𝓵𝓮.com",  # Mixed fullwidth and cursive in domain
    ],
)
def test_authentication_getter_existing_user_email_tricky(email, monkeypatch, settings):
    """Test email matching security against visually similar but non-ASCII domains.

    Validates that emails with Unicode characters that visually resemble ASCII
    (homoglyphs) are treated as distinct from their ASCII counterparts for security,
    per RFC compliance requirements for hostnames.
    """

    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True

    klass = OIDCAuthenticationBackend()
    db_user = UserFactory(email="john.doe@example.com")

    def get_userinfo_mocked(*args):
        return {"sub": "123", "email": email}

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    user = klass.get_or_create_user(
        access_token="test-token", id_token=None, payload=None
    )

    assert user != db_user


@pytest.mark.parametrize(
    "given_name, usual_name, email",
    [
        ("Jack", "Doe", "john.doe@example.com"),
        ("John", "Duy", "john.doe@example.com"),
        ("John", "Doe", "jack.duy@example.com"),
        ("Jack", "Duy", "jack.duy@example.com"),
    ],
)
def test_authentication_getter_existing_user_change_fields(
    given_name, usual_name, email, django_assert_num_queries, monkeypatch
):
    """It should update the email or name fields on the user when they change."""

    klass = OIDCAuthenticationBackend()
    user = UserFactory(
        full_name="John Doe", short_name="John", email="john.doe@example.com"
    )

    def get_userinfo_mocked(*args):
        return {
            "sub": user.sub,
            "email": email,
            "given_name": given_name,
            "usual_name": usual_name,
        }

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    # One and only one additional update query when a field has changed
    with django_assert_num_queries(2):
        authenticated_user = klass.get_or_create_user(
            access_token="test-token", id_token=None, payload=None
        )

    assert user == authenticated_user
    user.refresh_from_db()
    assert user.email == email
    assert user.full_name == f"{given_name:s} {usual_name:s}"
    assert user.short_name == given_name


@pytest.mark.parametrize(
    "user_info, expected_name",
    [
        ({"given_name": "John", "family_name": "Doe"}, "John Doe"),
        (
            {"given_name": "John", "middle_name": "M", "family_name": "Doe"},
            "John M Doe",
        ),
        ({"family_name": "Doe"}, "Doe"),
        ({"given_name": "", "family_name": ""}, None),
        ({}, None),
    ],
)
def test_compute_full_name(user_info, expected_name, settings):
    """Test full name computation from OIDC user info fields."""
    settings.OIDC_USERINFO_FULLNAME_FIELDS = [
        "given_name",
        "middle_name",
        "family_name",
    ]
    klass = OIDCAuthenticationBackend()
    assert klass.compute_full_name(user_info) == expected_name


def test_compute_full_name_no_fields(settings):
    """Test full name computation with empty field configuration."""
    settings.OIDC_USERINFO_FULLNAME_FIELDS = []
    klass = OIDCAuthenticationBackend()
    assert klass.compute_full_name({"given_name": "John"}) is None


@pytest.mark.parametrize(
    "claims",
    [
        {"email": "john.doe@example.com"},  # Same data - no change needed
        {"email": ""},  # Empty strings should not override
        {"non_related_field": "foo"},  # Unrelated fields should be ignored
        {},  # Empty claims should not affect user
        {"email": None},  # None values should be ignored
    ],
)
def test_update_user_when_no_update_needed(django_assert_num_queries, claims):
    """Test that user attributes remain unchanged when claims don't require updates."""

    user = UserFactory(
        full_name="John Doe", short_name="John", email="john.doe@example.com"
    )

    klass = OIDCAuthenticationBackend()

    with django_assert_num_queries(0):
        klass.update_user_if_needed(user, claims)

    user.refresh_from_db()

    assert user.email == "john.doe@example.com"


@mock.patch.object(OIDCAuthenticationBackend, "signup_to_marketing_email")
def test_marketing_signup_new_user_enabled(mock_signup, monkeypatch, settings):
    """Test marketing signup for new user with settings enabled."""
    settings.SIGNUP_NEW_USER_TO_MARKETING_EMAIL = True

    klass = OIDCAuthenticationBackend()
    email = "test@example.com"

    def get_userinfo_mocked(*args):
        return {"sub": "123", "email": email}

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    user = klass.get_or_create_user("test-token", None, None)

    assert user.email == email
    mock_signup.assert_called_once_with(email)


@mock.patch.object(OIDCAuthenticationBackend, "signup_to_marketing_email")
def test_marketing_signup_new_user_disabled(mock_signup, monkeypatch, settings):
    """Test no marketing signup for new user with settings disabled."""
    settings.SIGNUP_NEW_USER_TO_MARKETING_EMAIL = False

    klass = OIDCAuthenticationBackend()
    email = "test@example.com"

    def get_userinfo_mocked(*args):
        return {"sub": "123", "email": email}

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    user = klass.get_or_create_user("test-token", None, None)

    assert user.email == email
    mock_signup.assert_not_called()


@mock.patch.object(OIDCAuthenticationBackend, "signup_to_marketing_email")
def test_marketing_signup_new_user_default_disabled(mock_signup, monkeypatch):
    """Test no marketing signup for new user with settings by default disabled."""

    klass = OIDCAuthenticationBackend()
    email = "test@example.com"

    def get_userinfo_mocked(*args):
        return {"sub": "123", "email": email}

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    user = klass.get_or_create_user("test-token", None, None)

    assert user.email == email
    mock_signup.assert_not_called()


@pytest.mark.parametrize(
    "is_signup_enabled",
    [True, False],
)
@mock.patch.object(OIDCAuthenticationBackend, "signup_to_marketing_email")
def test_marketing_signup_existing_user(
    mock_signup, monkeypatch, settings, is_signup_enabled
):
    """Test no marketing signup for existing user regardless of settings."""

    settings.SIGNUP_NEW_USER_TO_MARKETING_EMAIL = is_signup_enabled

    klass = OIDCAuthenticationBackend()
    db_user = UserFactory(email="test@example.com")

    def get_userinfo_mocked(*args):
        return {"sub": db_user.sub, "email": db_user.email}

    monkeypatch.setattr(OIDCAuthenticationBackend, "get_userinfo", get_userinfo_mocked)

    user = klass.get_or_create_user("test-token", None, None)
    assert user == db_user
    mock_signup.assert_not_called()


@mock.patch("core.authentication.backends.get_marketing_service")
def test_signup_to_marketing_email_success(mock_marketing):
    """Test successful marketing signup."""

    email = "test@example.com"

    # Call the method
    OIDCAuthenticationBackend.signup_to_marketing_email(email)

    # Verify service interaction
    mock_service = mock_marketing.return_value
    mock_service.create_contact.assert_called_once()


@pytest.mark.parametrize(
    "error",
    [
        ImportError,
        ImproperlyConfigured,
    ],
)
@mock.patch("core.authentication.backends.get_marketing_service")
def test_marketing_signup_handles_service_initialization_errors(
    mock_marketing, error, settings
):
    """Tests errors that occur when trying to get/initialize the marketing service."""
    settings.SIGNUP_NEW_USER_TO_MARKETING_EMAIL = True

    mock_marketing.side_effect = error

    # Should not raise any exception
    OIDCAuthenticationBackend.signup_to_marketing_email("test@example.com")


@pytest.mark.parametrize(
    "error",
    [
        marketing.ContactCreationError,
        ImproperlyConfigured,
        ImportError,
    ],
)
@mock.patch("core.authentication.backends.get_marketing_service")
def test_marketing_signup_handles_contact_creation_errors(
    mock_marketing, error, settings
):
    """Tests errors that occur during the contact creation process."""

    settings.SIGNUP_NEW_USER_TO_MARKETING_EMAIL = True
    mock_marketing.return_value.create_contact.side_effect = error

    # Should not raise any exception
    OIDCAuthenticationBackend.signup_to_marketing_email("test@example.com")
