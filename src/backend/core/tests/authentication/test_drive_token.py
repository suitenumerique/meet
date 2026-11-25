"""Tests for getting a token to call Drive with when a user logs in."""

# pylint: disable=redefined-outer-name,unused-argument

from unittest import mock

import pytest

from core.authentication.backends import OIDCAuthenticationBackend
from core.factories import UserFactory
from core.recording.delivery.credentials import (
    SESSION_KEY,
    Credential,
    CredentialError,
    TokenExchangeProvider,
)

pytestmark = pytest.mark.django_db

CALLBACK_URL = "/api/v1.0/callback/"


@pytest.fixture(autouse=True)
def drive_settings(settings, encryption_key):
    """Push recordings to Drive with a token exchanged with Menshen."""
    settings.RECORDING_STORAGE_METHOD = "drive"
    settings.RECORDING_DRIVE_AUTH_METHOD = "token_exchange"
    settings.OIDC_OP_TOKEN_ENDPOINT = "https://oidc.example.com/token"
    settings.OIDC_OP_USER_ENDPOINT = "https://oidc.example.com/userinfo"
    settings.LOGIN_REDIRECT_URL = "/"
    settings.LOGIN_REDIRECT_URL_FAILURE = "/failure"


@pytest.fixture
def obtain():
    """Mock exchanging the user's access token with Menshen."""
    with mock.patch.object(
        TokenExchangeProvider, "obtain", return_value=Credential("exchanged-token")
    ) as mocked:
        yield mocked


def log_in(client, user):
    """Log a user in, as the callback of the identity provider does."""
    session = client.session
    session["oidc_states"] = {"a-state": {"nonce": "a-nonce", "code_verifier": None}}
    session.save()

    with (
        mock.patch.multiple(
            OIDCAuthenticationBackend,
            # Mock what `get_token` gets, not `get_token`, which keeps it
            verify_token=mock.Mock(return_value={"sub": user.sub}),
            get_userinfo=mock.Mock(return_value={"sub": user.sub, "email": user.email}),
        ),
        mock.patch(
            "mozilla_django_oidc.auth.OIDCAuthenticationBackend.get_token",
            return_value={
                "access_token": "user-access-token",
                "id_token": "id-token",
                "refresh_token": "refresh-token",
            },
        ),
    ):
        return client.get(CALLBACK_URL, {"code": "a-code", "state": "a-state"})


def test_login_stores_drive_token(client, obtain):
    """The access token is exchanged at login, and not kept itself."""
    user = UserFactory()

    response = log_in(client, user)

    assert response.status_code == 302
    assert response.url == "/"
    obtain.assert_called_once_with("user-access-token")
    assert client.session["_auth_user_id"] == str(user.pk)
    assert client.session[SESSION_KEY]["user_id"] == str(user.pk)
    assert "oidc_access_token" not in client.session


def test_login_again_renews_drive_token(client, obtain):
    """A user logging in again gets a new token."""
    user = UserFactory()
    log_in(client, user)
    first_token = client.session[SESSION_KEY]["token"]

    log_in(client, user)

    assert obtain.call_count == 2
    assert client.session[SESSION_KEY]["token"] != first_token


@pytest.mark.parametrize("error", [CredentialError("refused"), RuntimeError("boom")])
def test_login_without_drive_token(client, obtain, error):
    """A user logs in even if Menshen gives no token."""
    obtain.side_effect = error
    user = UserFactory()

    response = log_in(client, user)

    assert response.url == "/"
    assert client.session["_auth_user_id"] == str(user.pk)
    assert SESSION_KEY not in client.session


def test_login_not_pushing_to_drive(client, obtain, settings):
    """Nothing is exchanged when recordings are not pushed to Drive."""
    settings.RECORDING_STORAGE_METHOD = "s3_email"
    user = UserFactory()

    log_in(client, user)

    obtain.assert_not_called()
    assert client.session["_auth_user_id"] == str(user.pk)


def test_login_inactive_user(client, obtain):
    """No token is obtained for a user who is denied access."""
    user = UserFactory(is_active=False)

    response = log_in(client, user)

    assert response.url == "/failure"
    obtain.assert_not_called()
    assert SESSION_KEY not in client.session


def test_login_as_someone_else(client, obtain):
    """The token of a user is not left in the session of the next one."""
    log_in(client, UserFactory())
    user = UserFactory()

    log_in(client, user)

    assert client.session["_auth_user_id"] == str(user.pk)
    # Django flushes the session, until the next login
    assert SESSION_KEY not in client.session
