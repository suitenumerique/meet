"""
Test event authentication.
"""

# pylint: disable=assignment-from-no-return

from django.test import RequestFactory

import pytest
from rest_framework.exceptions import AuthenticationFailed

from core.recording.event.authentication import (
    MachineUser,
    RecordingProcessWebhookAuthentication,
)


def test_successful_authentication(settings):
    """Test successful authentication with valid token."""
    settings.SUMMARY_SERVICE_WEBHOOK_API_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Bearer valid-test-token"}

    user, token = RecordingProcessWebhookAuthentication().authenticate(request)
    assert token == "valid-test-token"
    assert isinstance(user, MachineUser)


def test_authentication_fails_when_token_not_configured(settings):
    """Authentication should fail when no token is configured."""

    settings.SUMMARY_SERVICE_WEBHOOK_API_TOKEN = None

    request = RequestFactory().get("/")

    with pytest.raises(
        AuthenticationFailed,
        match="Authentication token is not configured",
    ):
        RecordingProcessWebhookAuthentication().authenticate(request)


def test_missing_auth_header(settings):
    """Test failure when Authorization header is missing."""
    settings.SUMMARY_SERVICE_WEBHOOK_API_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {}

    with pytest.raises(AuthenticationFailed, match="Authorization header is required"):
        RecordingProcessWebhookAuthentication().authenticate(request)


def test_invalid_auth_header_format(settings):
    """Test failure when Authorization header has invalid format."""
    settings.SUMMARY_SERVICE_WEBHOOK_API_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "InvalidFormat"}

    with pytest.raises(AuthenticationFailed, match="Invalid authorization header"):
        RecordingProcessWebhookAuthentication().authenticate(request)


def test_invalid_token_type(settings):
    """Test failure when token type is not Bearer."""
    settings.SUMMARY_SERVICE_WEBHOOK_API_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Basic some-token"}

    with pytest.raises(AuthenticationFailed, match="Invalid authorization header"):
        RecordingProcessWebhookAuthentication().authenticate(request)


def test_invalid_token(settings):
    """Test failure when token is invalid."""
    settings.SUMMARY_SERVICE_WEBHOOK_API_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Bearer wrong-token"}

    with pytest.raises(AuthenticationFailed, match="Invalid token"):
        RecordingProcessWebhookAuthentication().authenticate(request)


def test_malformed_auth_header(settings):
    """Test failure when Authorization header is malformed."""
    settings.SUMMARY_SERVICE_WEBHOOK_API_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Bearer"}  # Missing token part

    with pytest.raises(AuthenticationFailed, match="Invalid authorization header"):
        RecordingProcessWebhookAuthentication().authenticate(request)


def test_authenticate_header():
    """Test the WWW-Authenticate header value."""
    request = RequestFactory().get("/")
    header = RecordingProcessWebhookAuthentication().authenticate_header(request)
    assert header == "Bearer realm='External process webhook API'"


def test_multiple_spaces_in_auth_header(settings):
    """Extra spaces between the scheme and the token should be tolerated."""
    settings.SUMMARY_SERVICE_WEBHOOK_API_TOKEN = "extra-spaces-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Bearer   extra-spaces-token"}

    user, token = RecordingProcessWebhookAuthentication().authenticate(request)
    assert token == "extra-spaces-token"
    assert isinstance(user, MachineUser)
