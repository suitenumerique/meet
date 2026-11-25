"""Tokens Meet calls Drive with, on behalf of the user who started a recording.

A token is obtained when the user logs in, the only time their access token is
sure to be fresh, and kept encrypted in their session. A recording that starts
gets a copy of it, used once the recording is over, from a worker. Each type of
token has its provider, obtaining it.

A token is never revoked, but left to expire: the recordings of a session share it,
and may be pushed after the user logged out.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone

from menshen_client import (
    Configuration,
    MenshenClientError,
    TokenExchangeClient,
    TokenExchangeRequest,
    TokenType,
)

from core import models, utils

logger = logging.getLogger(__name__)

# Timeout of Menshen calls, in seconds: the user waits for them to log in.
MENSHEN_TIMEOUT = 3.0

# Where the token is kept in the session.
SESSION_KEY = "drive_credential"


class CredentialError(Exception):
    """Raised when there is no token to call Drive with."""


@dataclass(frozen=True)
class Credential:
    """A token to call Drive with, and when it expires if known."""

    value: str
    expires_at: datetime | None = None


class CredentialProvider:
    """Obtain one type of token."""

    token_type: str

    def obtain(self, access_token: str) -> Credential:
        """Obtain a token from the access token of a user logging in."""
        raise NotImplementedError


def get_menshen_client() -> TokenExchangeClient:
    """Return a client for Menshen, authenticated as Meet. Close it after use."""

    return TokenExchangeClient(
        config=Configuration(
            settings.MENSHEN_CLIENT_ID,
            settings.MENSHEN_CLIENT_SECRET,
            settings.MENSHEN_SERVER_URL,
            requests_timeout=MENSHEN_TIMEOUT,
        )
    )


class TokenExchangeProvider(CredentialProvider):
    """Exchange the user's access token with Menshen for a token targeting Drive.

    The exchanged token lasts as long as Menshen's exchange rule says, which is
    meant to outlast the session, and the recordings started in it.
    """

    token_type = models.DriveTokenTypeChoices.TOKEN_EXCHANGE

    def obtain(self, access_token: str) -> Credential:
        """Exchange the access token."""

        exchange_request = TokenExchangeRequest(
            subject_token=access_token,
            subject_token_type=TokenType.ACCESS_TOKEN,
            audience=settings.RECORDING_DRIVE_AUDIENCE,
            scope=settings.RECORDING_DRIVE_SCOPE or None,
        )

        try:
            with get_menshen_client() as client:
                response = client.exchange(exchange_request)
        except MenshenClientError as exc:
            raise CredentialError(f"Menshen token exchange failed: {exc}") from exc

        if response.expires_in < settings.SESSION_COOKIE_AGE:
            logger.warning(
                "Menshen tokens last %ds, less than sessions (%ds): recordings "
                "started late in a session cannot be pushed to Drive",
                response.expires_in,
                settings.SESSION_COOKIE_AGE,
            )

        return Credential(
            response.access_token,
            timezone.now() + timedelta(seconds=response.expires_in),
        )


PROVIDERS: dict[str, CredentialProvider] = {
    models.DriveTokenTypeChoices.TOKEN_EXCHANGE: TokenExchangeProvider(),
}


def get_provider(token_type: str) -> CredentialProvider:
    """Return the provider of a type of token."""
    return PROVIDERS[token_type]


def store_in_session(request, user, access_token: str | None) -> None:
    """Obtain a token for the user logging in, and keep it in their session.

    Never raises: the user logs in even if their recordings cannot be pushed.
    """

    if settings.RECORDING_STORAGE_METHOD != models.RecordingDeliveryMethodChoices.DRIVE:
        return

    try:
        if not access_token:
            raise CredentialError("No access token to obtain it from.")

        token_type = settings.RECORDING_DRIVE_AUTH_METHOD
        credential = get_provider(token_type).obtain(access_token)

        request.session[SESSION_KEY] = {
            "user_id": str(user.pk),
            "token_type": token_type,
            "token": utils.encrypt_secret(credential.value),
            "expires_at": (
                credential.expires_at.isoformat() if credential.expires_at else None
            ),
        }
    except CredentialError as exc:
        logger.warning("No token to call Drive with for user %s: %s", user.pk, exc)
    except Exception:  # pylint: disable=broad-exception-caught
        logger.exception("Error getting a token to call Drive for user %s", user.pk)


def get_from_session(request) -> Credential:
    """Return the token kept in the session of the user.

    Raises:
        CredentialError: there is none, or it cannot be used (anymore).
    """

    stored = request.session.get(SESSION_KEY)

    if not stored or stored["user_id"] != str(request.user.pk):
        raise CredentialError("No token to call Drive with in the session.")

    if stored["token_type"] != settings.RECORDING_DRIVE_AUTH_METHOD:
        raise CredentialError("The token of the session is of another type.")

    expires_at = stored["expires_at"] and datetime.fromisoformat(stored["expires_at"])
    if expires_at and expires_at <= timezone.now():
        raise CredentialError("The token of the session has expired.")

    try:
        value = utils.decrypt_secret(stored["token"])
    except utils.SecretDecryptionError as exc:
        raise CredentialError("The token of the session cannot be decrypted.") from exc

    return Credential(value, expires_at)
