"""Tokens Meet calls Drive with, on behalf of the user who started a recording.

A token is obtained while the user is around, when the recording starts, and
used once the recording is over, from a worker. Each type of token has its
provider: how to obtain it from the request, and how to let go of it.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone

import httpx2
from menshen_client import (
    Configuration,
    RevocationRequest,
    TokenExchangeClient,
    TokenExchangeRequest,
    TokenType,
)
from menshen_client.exceptions import ResponseParsingError

from core.models import DriveTokenTypeChoices

logger = logging.getLogger(__name__)

# Timeout of Menshen calls, in seconds: the exchange happens while the user
# waits for the recording to start.
MENSHEN_TIMEOUT = 10.0


class CredentialError(Exception):
    """Raised when a token to call Drive cannot be obtained."""


@dataclass(frozen=True)
class Credential:
    """A token to call Drive with, and when it expires if known."""

    value: str
    expires_at: datetime | None = None


class CredentialProvider:
    """Obtain, then let go of, one type of token."""

    token_type: str

    def acquire(self, request) -> Credential:
        """Obtain a token from the request of the user starting the recording."""
        raise NotImplementedError

    def release(self, token: str) -> None:
        """Let go of a token that will not be used anymore."""


def _get_session_access_token(request) -> str:
    """Return the user's OIDC access token, kept in their session."""

    access_token = request.session.get("oidc_access_token")

    if not access_token:
        raise CredentialError(
            "No OIDC access token in the session. Is OIDC_STORE_ACCESS_TOKEN enabled?"
        )

    return access_token


class AccessTokenProvider(CredentialProvider):
    """Use the user's OIDC access token itself.

    Its expiration is not known: it is assumed to still be valid when the
    recording is over, Drive refuses it otherwise.
    """

    token_type = DriveTokenTypeChoices.ACCESS_TOKEN

    def acquire(self, request) -> Credential:
        """Return the access token of the session."""
        return Credential(_get_session_access_token(request))


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
    meant to outlast the recording, and is revoked once the push is over.
    """

    token_type = DriveTokenTypeChoices.TOKEN_EXCHANGE

    def acquire(self, request) -> Credential:
        """Exchange the access token of the session."""

        exchange_request = TokenExchangeRequest(
            subject_token=_get_session_access_token(request),
            subject_token_type=TokenType.ACCESS_TOKEN,
            audience=settings.RECORDING_DRIVE_AUDIENCE,
            scope=settings.RECORDING_DRIVE_SCOPE or None,
        )

        try:
            with get_menshen_client() as client:
                response = client.exchange(exchange_request)
        except (httpx2.HTTPError, ResponseParsingError) as exc:
            raise CredentialError(f"Menshen token exchange failed: {exc}") from exc

        return Credential(
            response.access_token,
            timezone.now() + timedelta(seconds=response.expires_in),
        )

    def release(self, token: str) -> None:
        """Revoke the exchanged token, it is not needed anymore."""

        try:
            with get_menshen_client() as client:
                client.revoke(
                    RevocationRequest(
                        token=token, token_type_hint=TokenType.ACCESS_TOKEN
                    )
                )
        except httpx2.HTTPError:
            # It expires on its own anyway
            logger.warning("Could not revoke an exchanged token", exc_info=True)


PROVIDERS: dict[str, CredentialProvider] = {
    DriveTokenTypeChoices.ACCESS_TOKEN: AccessTokenProvider(),
    DriveTokenTypeChoices.TOKEN_EXCHANGE: TokenExchangeProvider(),
}


def get_provider(token_type: str) -> CredentialProvider:
    """Return the provider of a type of token."""
    return PROVIDERS[token_type]
