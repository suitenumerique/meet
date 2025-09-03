"""
Test event authentication.
"""

# pylint: disable=assignment-from-no-return

from django.test import RequestFactory

import pytest
from rest_framework.exceptions import AuthenticationFailed

from core.recording.event.authentication import (
    MachineUser,
    StorageEventAuthentication,
)


def test_successful_authentication(settings):
    """Test successful authentication with valid token."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Bearer valid-test-token"}

    user, token = StorageEventAuthentication().authenticate(request)
    assert token == "valid-test-token"
    assert isinstance(user, MachineUser)


def test_disabled_authentication_with_header(settings):
    """Authentication should pass when no auth is configured, and header is present."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = None
    settings.RECORDING_ENABLE_STORAGE_EVENT_AUTH = False

    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Bearer some-token"}

    user, token = StorageEventAuthentication().authenticate(request)
    assert token is None
    assert isinstance(user, MachineUser)


def test_disabled_authentication_without_header(settings):
    """Authentication should pass when no auth is configured, and no header is present."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = None
    settings.RECORDING_ENABLE_STORAGE_EVENT_AUTH = False

    request = RequestFactory().get("/")

    user, token = StorageEventAuthentication().authenticate(request)
    assert token is None
    assert isinstance(user, MachineUser)


def test_authentication_when_disabled(settings):
    """Authentication should pass when disabled, regardless of token configuration."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "some-token"
    settings.RECORDING_ENABLE_STORAGE_EVENT_AUTH = False

    request = RequestFactory().get("/")

    user, token = StorageEventAuthentication().authenticate(request)
    assert token is None
    assert isinstance(user, MachineUser)


def test_authentication_fails_when_token_not_configured(settings):
    """Authentication should fail when authentication is enabled but no token is configured."""

    # By default RECORDING_ENABLE_STORAGE_EVENT_AUTH should be True
    settings.RECORDING_STORAGE_EVENT_TOKEN = None

    request = RequestFactory().get("/")

    with pytest.raises(
        AuthenticationFailed,
        match="Authentication is enabled but token is not configured",
    ):
        StorageEventAuthentication().authenticate(request)


def test_missing_auth_header(settings):
    """Test failure when Authorization header is missing."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {}

    with pytest.raises(AuthenticationFailed, match="Authorization header is required"):
        StorageEventAuthentication().authenticate(request)


def test_invalid_auth_header_format(settings):
    """Test failure when Authorization header has invalid format."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "InvalidFormat"}

    with pytest.raises(AuthenticationFailed, match="Invalid authorization header"):
        StorageEventAuthentication().authenticate(request)


def test_invalid_token_type(settings):
    """Test failure when token type is not Bearer."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Basic some-token"}

    with pytest.raises(AuthenticationFailed, match="Invalid authorization header"):
        StorageEventAuthentication().authenticate(request)


def test_invalid_token(settings):
    """Test failure when token is invalid."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Bearer wrong-token"}

    with pytest.raises(AuthenticationFailed, match="Invalid token"):
        StorageEventAuthentication().authenticate(request)


def test_malformed_auth_header(settings):
    """Test failure when Authorization header is malformed."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Bearer"}  # Missing token part

    with pytest.raises(AuthenticationFailed, match="Invalid authorization header"):
        StorageEventAuthentication().authenticate(request)


def test_authenticate_header():
    """Test the WWW-Authenticate header value."""
    request = RequestFactory().get("/")
    header = StorageEventAuthentication().authenticate_header(request)
    assert header == "Bearer realm='Storage event API'"


def test_multiple_spaces_in_auth_header(settings):
    """Test failure when Authorization header contains multiple spaces."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "valid-test-token"
    request = RequestFactory().get("/")
    request.headers = {"Authorization": "Bearer   extra-spaces-token"}

    with pytest.raises(AuthenticationFailed, match="Invalid authorization header"):
        StorageEventAuthentication().authenticate(request)
