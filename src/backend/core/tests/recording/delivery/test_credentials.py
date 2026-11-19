"""Tests for the tokens Meet calls Drive with, on behalf of a recording's starter."""

# pylint: disable=redefined-outer-name

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs

import httpx2
import pytest
from freezegun import freeze_time

from core.models import DriveTokenTypeChoices
from core.recording.delivery.credentials import (
    MENSHEN_TIMEOUT,
    AccessTokenProvider,
    CredentialError,
    TokenExchangeProvider,
    get_menshen_client,
    get_provider,
)

SERVER_URL = "https://menshen.example.com"
EXCHANGE_ENDPOINT = f"{SERVER_URL}/auth/token/exchange/"
REVOCATION_ENDPOINT = f"{SERVER_URL}/auth/token/revoke/"


@pytest.fixture(autouse=True)
def menshen_settings(settings):
    """Configure Menshen, and Drive's audience there."""
    settings.MENSHEN_SERVER_URL = SERVER_URL
    settings.MENSHEN_CLIENT_ID = "meet"
    settings.MENSHEN_CLIENT_SECRET = "meet-secret"
    settings.RECORDING_DRIVE_AUDIENCE = "drive"
    settings.RECORDING_DRIVE_SCOPE = None


def make_request(access_token="user-access-token"):
    """Return a request whose session holds the user's access token, if any."""
    session = {"oidc_access_token": access_token} if access_token else {}
    return SimpleNamespace(session=session)


def exchange_response(**overrides):
    """Return a successful token exchange response body."""
    return {
        "access_token": "exchanged-token",
        "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
        "token_type": "bearer",
        "expires_in": 7200,
        "grants": [],
        **overrides,
    }


def test_get_provider():
    """Each token type has its provider."""
    assert isinstance(
        get_provider(DriveTokenTypeChoices.ACCESS_TOKEN), AccessTokenProvider
    )
    assert isinstance(
        get_provider(DriveTokenTypeChoices.TOKEN_EXCHANGE), TokenExchangeProvider
    )


def test_access_token_acquire():
    """The access token of the session is used as is, its expiration unknown."""
    credential = AccessTokenProvider().acquire(make_request())

    assert credential.value == "user-access-token"
    assert credential.expires_at is None


def test_access_token_acquire_missing():
    """Without an access token in the session, there is no credential."""
    with pytest.raises(CredentialError, match="OIDC_STORE_ACCESS_TOKEN"):
        AccessTokenProvider().acquire(make_request(access_token=None))


def test_access_token_release_calls_nothing(httpx2_mock):
    """An access token is not revoked: it belongs to the user's session."""
    AccessTokenProvider().release("user-access-token")

    assert not httpx2_mock.get_requests()


def test_menshen_client_has_a_timeout():
    """The exchange happens while the user waits: Menshen calls are bounded."""
    with get_menshen_client() as client:
        assert client.config.requests_timeout == MENSHEN_TIMEOUT


@freeze_time("2026-11-19 10:00:00")
def test_token_exchange_acquire(httpx2_mock):
    """The access token of the session is exchanged for a token targeting Drive."""
    httpx2_mock.add_response(
        method="POST", url=EXCHANGE_ENDPOINT, json=exchange_response()
    )

    credential = TokenExchangeProvider().acquire(make_request())

    assert credential.value == "exchanged-token"
    assert credential.expires_at == datetime(
        2026, 11, 19, 10, 0, tzinfo=timezone.utc
    ) + timedelta(seconds=7200)

    request = httpx2_mock.get_request()
    assert request.headers["Authorization"].startswith("Basic ")
    assert parse_qs(request.content.decode()) == {
        "subject_token": ["user-access-token"],
        "subject_token_type": ["urn:ietf:params:oauth:token-type:access_token"],
        "grant_type": ["urn:ietf:params:oauth:grant-type:token-exchange"],
        "audience": ["drive"],
    }


def test_token_exchange_acquire_with_scope(httpx2_mock, settings):
    """Configured scopes are asked for."""
    settings.RECORDING_DRIVE_SCOPE = "drive:item:create drive:item:upload-ended"
    httpx2_mock.add_response(
        method="POST", url=EXCHANGE_ENDPOINT, json=exchange_response()
    )

    TokenExchangeProvider().acquire(make_request())

    form = parse_qs(httpx2_mock.get_request().content.decode())
    assert form["scope"] == ["drive:item:create drive:item:upload-ended"]


def test_token_exchange_acquire_without_session_token(httpx2_mock):
    """Without an access token in the session, Menshen is not called."""
    with pytest.raises(CredentialError, match="OIDC_STORE_ACCESS_TOKEN"):
        TokenExchangeProvider().acquire(make_request(access_token=None))

    assert not httpx2_mock.get_requests()


@pytest.mark.parametrize(
    "response",
    [
        {"status_code": 400, "json": {"error": "invalid_target"}},
        {"status_code": 500},
        {"json": {"unexpected": "field"}},
    ],
)
def test_token_exchange_acquire_refused(httpx2_mock, response):
    """A refused, failed or unparsable exchange gives no credential."""
    httpx2_mock.add_response(method="POST", url=EXCHANGE_ENDPOINT, **response)

    with pytest.raises(CredentialError, match="Menshen token exchange failed"):
        TokenExchangeProvider().acquire(make_request())


def test_token_exchange_acquire_unreachable(httpx2_mock):
    """An unreachable Menshen gives no credential."""
    httpx2_mock.add_exception(httpx2.ConnectError("Connection refused"))

    with pytest.raises(CredentialError, match="Menshen token exchange failed"):
        TokenExchangeProvider().acquire(make_request())


def test_token_exchange_release_revokes(httpx2_mock):
    """The exchanged token is revoked once it is not needed anymore."""
    httpx2_mock.add_response(method="POST", url=REVOCATION_ENDPOINT)

    TokenExchangeProvider().release("exchanged-token")

    assert parse_qs(httpx2_mock.get_request().content.decode()) == {
        "token": ["exchanged-token"],
        "token_type_hint": ["urn:ietf:params:oauth:token-type:access_token"],
    }


def test_token_exchange_release_failure_is_ignored(httpx2_mock, caplog):
    """A failed revocation is only logged: the token expires on its own."""
    httpx2_mock.add_response(method="POST", url=REVOCATION_ENDPOINT, status_code=503)

    TokenExchangeProvider().release("exchanged-token")

    assert "Could not revoke an exchanged token" in caplog.text
