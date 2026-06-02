"""
Unit tests for the User model
"""

from unittest import mock

from django.core.exceptions import ValidationError

import pytest

from core import factories

pytestmark = pytest.mark.django_db


def test_models_users_str():
    """The str representation should be the email."""
    user = factories.UserFactory()
    assert str(user) == user.email


def test_models_users_id_unique():
    """The "id" field should be unique."""
    user = factories.UserFactory()
    with pytest.raises(ValidationError, match="User with this Id already exists."):
        factories.UserFactory(id=user.id)


def test_models_users_send_mail_main_existing():
    """The "email_user' method should send mail to the user's email address."""
    user = factories.UserFactory()

    with mock.patch("django.core.mail.send_mail") as mock_send:
        user.email_user("my subject", "my message")

    mock_send.assert_called_once_with("my subject", "my message", None, [user.email])


def test_models_users_send_mail_main_missing():
    """The "email_user' method should fail if the user has no email address."""
    user = factories.UserFactory(email=None)

    with pytest.raises(ValueError) as excinfo:
        user.email_user("my subject", "my message")

    assert str(excinfo.value) == "User has no email address."


def test_models_users_email_unique_when_sub_is_null():
    """Email should be unique among users with no sub (pending users)."""
    user = factories.UserFactory(sub=None, email="test@example.com")
    with pytest.raises(
        ValidationError, match="Constraint “unique_email_when_sub_is_null” is violated."
    ):
        factories.UserFactory(sub=None, email=user.email)


def test_models_users_email_unique_case_insensitive_when_sub_is_null():
    """Email uniqueness should be case-insensitive among users with no sub (pending users)."""
    factories.UserFactory(sub=None, email="Test@example.com")
    with pytest.raises(
        ValidationError, match="Constraint “unique_email_when_sub_is_null” is violated."
    ):
        factories.UserFactory(sub=None, email="test@example.com")


def test_models_users_email_not_unique_when_sub_is_set():
    """Email uniqueness should not be enforced when users have a sub."""
    user = factories.UserFactory(sub="sub-1", email="test@example.com")
    user2 = factories.UserFactory(sub="sub-2", email=user.email)
    assert user2.email == user.email


def test_models_users_email_not_unique_between_sub_null_and_sub_set():
    """A user with a sub and a pending user (sub=None) can share the same email."""
    user = factories.UserFactory(sub="sub-1", email="test@example.com")
    user2 = factories.UserFactory(sub=None, email=user.email)
    assert user2.email == user.email


def test_models_users_email_unique_constraint_allows_multiple_null_emails():
    """Multiple users with sub=None and email=None should be allowed."""
    factories.UserFactory(sub=None, email=None)
    factories.UserFactory(sub=None, email=None)


def test_models_users_sub_null_email_null_does_not_prevent_creation():
    """Multiple pending users (sub=None, email=None) can be created without conflict.

    sub=None is not unique-constrained. email uniqueness is only enforced among
    sub=None users with a non-null email, so email=None bypasses it (NULL != NULL in SQL).
    """
    # Ghost row can still appear from bad code path
    u1 = factories.UserFactory(sub=None, email=None)
    u2 = factories.UserFactory(sub=None, email=None)
    assert u1.pk != u2.pk
