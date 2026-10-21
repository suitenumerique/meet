"""OAuth 2.0 error responses for the external API token endpoint (RFC 6749 §5.2)."""

import unicodedata

from django.http import Http404

from rest_framework import exceptions as drf_exceptions
from rest_framework import status as drf_status

from core.api import exception_handler as default_exception_handler

OAUTH2_ERROR_INVALID_REQUEST = "invalid_request"
OAUTH2_ERROR_INVALID_CLIENT = "invalid_client"
OAUTH2_ERROR_UNSUPPORTED_GRANT_TYPE = "unsupported_grant_type"
OAUTH2_ERROR_INVALID_SCOPE = "invalid_scope"
OAUTH2_ERROR_SERVER_ERROR = "server_error"

OAUTH2_CLIENT_CREDENTIALS_FIELDS = {"client_id", "client_secret"}


class OAuth2Error(drf_exceptions.APIException):
    """Token endpoint error carrying an RFC 6749 error code as its DRF code."""

    def __init__(self, error, description, status_code=drf_status.HTTP_400_BAD_REQUEST):
        super().__init__(detail=description, code=error)
        self.status_code = status_code


def _get_validation_error_code(codes):
    """Map serializer error codes to the most relevant OAuth 2.0 error code."""
    if OAUTH2_CLIENT_CREDENTIALS_FIELDS & codes.keys():
        return OAUTH2_ERROR_INVALID_CLIENT
    if "invalid_choice" in codes.get("grant_type", []):
        return OAUTH2_ERROR_UNSUPPORTED_GRANT_TYPE
    return OAUTH2_ERROR_INVALID_REQUEST


def _get_error_code(exc):
    """Return the OAuth 2.0 error code matching an exception."""
    if isinstance(exc, OAuth2Error):
        return exc.get_codes()
    if isinstance(exc, drf_exceptions.ValidationError) and isinstance(exc.detail, dict):
        return _get_validation_error_code(exc.get_codes())
    if isinstance(
        exc, (drf_exceptions.AuthenticationFailed, drf_exceptions.NotAuthenticated)
    ):
        return OAUTH2_ERROR_INVALID_CLIENT
    return OAUTH2_ERROR_INVALID_REQUEST


def _format_error_description(data):
    """Flatten DRF error data into "field : message; field : message"."""
    if isinstance(data, dict):
        if data.keys() == {"detail"}:
            return _format_error_description(data["detail"])
        return "; ".join(
            f"{field} : {_format_error_description(messages)}"
            for field, messages in data.items()
        )
    if isinstance(data, list):
        return " ".join(_format_error_description(message) for message in data)
    return str(data)


def _sanitize_error_description(description):
    """Restrict a description to the characters allowed by RFC 6749 §5.2.

    Only printable ASCII is allowed, except for the double quote and the backslash.
    Translated messages are transliterated so they stay readable ("é" becomes "e").
    """
    ascii_description = (
        unicodedata.normalize("NFKD", description)
        .encode("ascii", "ignore")
        .decode("ascii")
        .replace('"', "'")
        .replace("\\", "/")
    )
    return "".join(char for char in ascii_description if " " <= char <= "~")


def oauth2_exception_handler(exc, context):
    """Render errors as RFC 6749 §5.2 responses: {"error", "error_description"}.

    Status codes and headers set by the default handler are kept.
    """
    response = default_exception_handler(exc, context)

    # A disabled feature flag raises Http404: keep it looking like a missing route.
    if response is None or isinstance(exc, Http404):
        return response

    response.data = {
        "error": _get_error_code(exc),
        "error_description": _sanitize_error_description(
            _format_error_description(response.data)
        ),
    }
    return response
