"""Test the public rooms settings guard, run at boot."""

import pytest

from meet.settings import validate_public_rooms_settings


def test_settings_public_rooms_reject_a_public_default():
    """Rooms created without a level would be public on an instance forbidding it."""
    with pytest.raises(ValueError, match="RESOURCE_DEFAULT_ACCESS_LEVEL"):
        validate_public_rooms_settings(
            allow_public_rooms=False,
            default_level="public",
            external_default="trusted",
        )


def test_settings_public_rooms_reject_a_public_external_default():
    """The external API creates rooms at its own default, which the guard covers too."""
    with pytest.raises(ValueError, match="EXTERNAL_API_DEFAULT_ACCESS_LEVEL"):
        validate_public_rooms_settings(
            allow_public_rooms=False,
            default_level="trusted",
            external_default="public",
        )


def test_settings_public_rooms_allow_a_public_default_while_public_rooms_are_on():
    """The defaults are only checked against a setting that forbids something."""
    validate_public_rooms_settings(
        allow_public_rooms=True,
        default_level="public",
        external_default="public",
    )
