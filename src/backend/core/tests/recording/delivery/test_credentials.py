"""Tests for the tokens Meet calls Drive with, on behalf of a recording's starter."""

# pylint: disable=redefined-outer-name,unused-argument

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import mock
from urllib.parse import parse_qs

from django.utils import timezone as django_timezone

import httpx2
import pytest
from freezegun import freeze_time

from core import factories
from core.models import DriveTokenTypeChoices
from core.recording.delivery import credentials
from core.recording.delivery.credentials import (
    MENSHEN_TIMEOUT,
    SESSION_KEY,
    Credential,
    CredentialError,
    TokenExchangeProvider,
    get_menshen_client,
    get_provider,
)

SERVER_URL = "https://menshen.example.com"
EXCHANGE_ENDPOINT = f"{SERVER_URL}/auth/token/exchange/"
# Opaque tokens shorter than 43 characters are refused by the client
EXCHANGED_TOKEN = "exchanged-token".ljust(43, "x")


@pytest.fixture(autouse=True)
def menshen_settings(settings):
    """Configure Menshen, and Drive's audience there."""
    settings.MENSHEN_SERVER_URL = SERVER_URL
    settings.MENSHEN_CLIENT_ID = "meet"
    settings.MENSHEN_CLIENT_SECRET = "meet-secret"
    settings.RECORDING_DRIVE_AUDIENCE = "drive"
    settings.RECORDING_DRIVE_SCOPE = None


@pytest.fixture
def drive_settings(settings, encryption_key):
    """Push recordings to Drive with a token exchanged with Menshen."""
    settings.RECORDING_STORAGE_METHOD = "drive"
    settings.RECORDING_DRIVE_AUTH_METHOD = "token_exchange"


def make_request(user=None):
    """Return a request of the user, whose session is empty."""
    return SimpleNamespace(user=user, session={})


def store(request, user, *, expires_in=timedelta(days=8)):
    """Keep an exchanged token in the session of the user."""
    with mock.patch.object(
        TokenExchangeProvider,
        "obtain",
        return_value=Credential(EXCHANGED_TOKEN, django_timezone.now() + expires_in),
    ):
        credentials.store_in_session(request, user, "user-access-token")


def exchange_response(**overrides):
    """Return a successful token exchange response body."""
    return {
        "access_token": EXCHANGED_TOKEN,
        "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
        "token_type": "bearer",
        "expires_in": 7200,
        "grants": [],
        **overrides,
    }


def test_get_provider():
    """Each token type has its provider."""
    assert isinstance(
        get_provider(DriveTokenTypeChoices.TOKEN_EXCHANGE), TokenExchangeProvider
    )


def test_menshen_client_has_a_timeout():
    """The user waits for Menshen to log in: its calls are bounded."""
    with get_menshen_client() as client:
        assert client.config.requests_timeout == MENSHEN_TIMEOUT


@freeze_time("2026-11-19 10:00:00")
def test_token_exchange_obtain(httpx2_mock):
    """The access token of the user is exchanged for a token targeting Drive."""
    httpx2_mock.add_response(
        method="POST", url=EXCHANGE_ENDPOINT, json=exchange_response()
    )

    credential = TokenExchangeProvider().obtain("user-access-token")

    assert credential.value == EXCHANGED_TOKEN
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


def test_token_exchange_obtain_with_scope(httpx2_mock, settings):
    """Configured scopes are asked for."""
    settings.RECORDING_DRIVE_SCOPE = "drive:item:create drive:item:upload-ended"
    httpx2_mock.add_response(
        method="POST", url=EXCHANGE_ENDPOINT, json=exchange_response()
    )

    TokenExchangeProvider().obtain("user-access-token")

    form = parse_qs(httpx2_mock.get_request().content.decode())
    assert form["scope"] == ["drive:item:create drive:item:upload-ended"]


@pytest.mark.parametrize(
    "response",
    [
        {"status_code": 400, "json": {"error": "invalid_target"}},
        {"status_code": 500},
        {"json": {"unexpected": "field"}},
    ],
)
def test_token_exchange_obtain_refused(httpx2_mock, response):
    """A refused, failed or unparsable exchange gives no credential."""
    httpx2_mock.add_response(method="POST", url=EXCHANGE_ENDPOINT, **response)

    with pytest.raises(CredentialError, match="Menshen token exchange failed"):
        TokenExchangeProvider().obtain("user-access-token")


def test_token_exchange_obtain_unreachable(httpx2_mock):
    """An unreachable Menshen gives no credential."""
    httpx2_mock.add_exception(httpx2.ConnectError("Connection refused"))

    with pytest.raises(CredentialError, match="Menshen token exchange failed"):
        TokenExchangeProvider().obtain("user-access-token")


@pytest.mark.parametrize(("expires_in", "warned"), [(3599, True), (3600, False)])
def test_token_exchange_obtain_short_lived(
    httpx2_mock, caplog, settings, expires_in, warned
):
    """A token expiring before the session is a configuration mistake."""
    settings.SESSION_COOKIE_AGE = 3600
    httpx2_mock.add_response(
        method="POST",
        url=EXCHANGE_ENDPOINT,
        json=exchange_response(expires_in=expires_in),
    )

    TokenExchangeProvider().obtain("user-access-token")

    assert ("less than sessions" in caplog.text) is warned


@pytest.mark.django_db
def test_store_in_session(drive_settings):
    """The token is kept, encrypted, and can be read back by its user."""
    user = factories.UserFactory()
    request = make_request(user)

    store(request, user)

    assert EXCHANGED_TOKEN not in str(request.session)
    credential = credentials.get_from_session(request)
    assert credential.value == EXCHANGED_TOKEN
    assert credential.expires_at > django_timezone.now() + timedelta(days=7)


@pytest.mark.django_db
def test_store_in_session_not_pushing_to_drive(drive_settings, settings, httpx2_mock):
    """Menshen is not called when recordings are not pushed to Drive."""
    settings.RECORDING_STORAGE_METHOD = "s3_email"
    user = factories.UserFactory()
    request = make_request(user)

    credentials.store_in_session(request, user, "user-access-token")

    assert not httpx2_mock.get_requests()
    assert request.session == {}


@pytest.mark.django_db
@pytest.mark.parametrize("error", [CredentialError("refused"), RuntimeError("boom")])
def test_store_in_session_never_raises(drive_settings, error):
    """Not getting a token is no reason not to log in."""
    user = factories.UserFactory()
    request = make_request(user)

    with mock.patch.object(TokenExchangeProvider, "obtain", side_effect=error):
        credentials.store_in_session(request, user, "user-access-token")

    assert request.session == {}


@pytest.mark.django_db
def test_store_in_session_failure_keeps_previous_token(drive_settings):
    """Logging in again without getting a new token keeps the one still valid."""
    user = factories.UserFactory()
    request = make_request(user)
    store(request, user)

    with mock.patch.object(
        TokenExchangeProvider, "obtain", side_effect=CredentialError("refused")
    ):
        credentials.store_in_session(request, user, "user-access-token")

    assert credentials.get_from_session(request).value == EXCHANGED_TOKEN


@pytest.mark.django_db
def test_store_in_session_without_access_token(drive_settings, httpx2_mock, caplog):
    """Without an access token, there is nothing to exchange."""
    user = factories.UserFactory()
    request = make_request(user)

    credentials.store_in_session(request, user, None)

    assert not httpx2_mock.get_requests()
    assert request.session == {}
    assert "No token to call Drive with" in caplog.text


@pytest.mark.django_db
def test_get_from_session_empty(drive_settings):
    """A session opened before recordings were pushed to Drive has no token."""
    with pytest.raises(CredentialError, match="No token"):
        credentials.get_from_session(make_request(factories.UserFactory()))


@pytest.mark.django_db
def test_get_from_session_of_someone_else(drive_settings):
    """A recording is never pushed to the Drive of someone else."""
    user = factories.UserFactory()
    request = make_request(user)
    store(request, user)
    request.user = factories.UserFactory()

    with pytest.raises(CredentialError, match="No token"):
        credentials.get_from_session(request)


@pytest.mark.django_db
def test_get_from_session_expired(drive_settings):
    """An expired token cannot be used."""
    user = factories.UserFactory()
    request = make_request(user)
    store(request, user, expires_in=timedelta(seconds=-1))

    with pytest.raises(CredentialError, match="expired"):
        credentials.get_from_session(request)


@pytest.mark.django_db
def test_get_from_session_other_type(drive_settings, settings):
    """A token obtained in another way than the one set cannot be used."""
    user = factories.UserFactory()
    request = make_request(user)
    store(request, user)
    settings.RECORDING_DRIVE_AUTH_METHOD = "other"

    with pytest.raises(CredentialError, match="another type"):
        credentials.get_from_session(request)


@pytest.mark.django_db
def test_get_from_session_key_rotated(drive_settings):
    """A token encrypted with another key cannot be used."""
    user = factories.UserFactory()
    request = make_request(user)
    store(request, user)
    request.session[SESSION_KEY]["token"] = "encrypted-with-another-key"

    with pytest.raises(CredentialError, match="decrypted"):
        credentials.get_from_session(request)
