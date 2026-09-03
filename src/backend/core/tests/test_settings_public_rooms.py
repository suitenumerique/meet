"""Test the public rooms settings guard, run at boot."""

import pytest

from meet.settings import validate_public_rooms_settings


@pytest.mark.parametrize(
    "name", ["RESOURCE_DEFAULT_ACCESS_LEVEL", "EXTERNAL_API_DEFAULT_ACCESS_LEVEL"]
)
def test_settings_public_rooms_reject_a_public_default(name):
    """Either default that creates rooms is refused where the instance forbids them."""
    with pytest.raises(ValueError, match=name):
        validate_public_rooms_settings(False, **{name: "public"})


def test_settings_public_rooms_allow_a_public_default_while_public_rooms_are_on():
    """The defaults are only checked against a setting that forbids something."""
    validate_public_rooms_settings(True, RESOURCE_DEFAULT_ACCESS_LEVEL="public")
