"""Unit tests for the checks of the recording storage method settings."""

# pylint: disable=protected-access

from django.core.exceptions import ImproperlyConfigured

import pytest

from meet import settings


def make_configuration(**overrides):
    """Build a throwaway configuration pushing to Drive through a token exchange."""
    attributes = {
        "RECORDING_STORAGE_METHOD": "drive",
        "RECORDING_DRIVE_AUTH_METHOD": "token_exchange",
        "RECORDING_DRIVE_AUDIENCE": "drive",
        "DRIVE_API_BASE_URL": "https://drive.example.com/external_api/v1.0",
        "DRIVE_FRONTEND_BASE_URL": "https://drive.example.com",
        "OIDC_STORE_REFRESH_TOKEN_KEY": "key",
        "MENSHEN_SERVER_URL": "https://menshen.example.com",
        "MENSHEN_CLIENT_ID": "meet",
        "MENSHEN_CLIENT_SECRET": "secret",
        **overrides,
    }
    return type("StorageConfiguration", (settings.Test,), attributes)


def test_recording_storage_s3_email_needs_nothing():
    """The default method requires no other setting."""
    configuration = make_configuration(
        RECORDING_STORAGE_METHOD="s3_email",
        RECORDING_DRIVE_AUTH_METHOD="unknown",
        DRIVE_API_BASE_URL=None,
    )

    configuration._check_recording_storage()


def test_recording_storage_drive_with_token_exchange():
    """A complete token exchange configuration passes."""
    make_configuration()._check_recording_storage()


def test_recording_storage_unknown_method():
    """An unknown method is refused."""
    configuration = make_configuration(RECORDING_STORAGE_METHOD="ftp")

    with pytest.raises(ImproperlyConfigured, match="RECORDING_STORAGE_METHOD"):
        configuration._check_recording_storage()


@pytest.mark.parametrize("auth_method", ["access_token", "refresh_token"])
def test_recording_storage_unknown_auth_method(auth_method):
    """An unknown way to call Drive is refused."""
    configuration = make_configuration(RECORDING_DRIVE_AUTH_METHOD=auth_method)

    with pytest.raises(ImproperlyConfigured, match="RECORDING_DRIVE_AUTH_METHOD"):
        configuration._check_recording_storage()


@pytest.mark.parametrize(
    "missing",
    [
        "DRIVE_API_BASE_URL",
        "DRIVE_FRONTEND_BASE_URL",
        "OIDC_STORE_REFRESH_TOKEN_KEY",
        "MENSHEN_SERVER_URL",
        "MENSHEN_CLIENT_ID",
        "MENSHEN_CLIENT_SECRET",
        "RECORDING_DRIVE_AUDIENCE",
    ],
)
def test_recording_storage_drive_missing_setting(missing):
    """Every setting the push needs is required, and named in the error."""
    configuration = make_configuration(**{missing: None})

    with pytest.raises(ImproperlyConfigured, match=missing):
        configuration._check_recording_storage()
