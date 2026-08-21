"""Test the room access level settings guards, run at boot."""

import pytest

from core.models import RoomAccessLevel

from meet.settings import ROOM_ACCESS_LEVELS, validate_access_level_settings

pytestmark = pytest.mark.django_db


def test_settings_access_levels_reject_a_default_outside_the_list():
    """Rooms created without an access level would land outside the allow-list."""
    with pytest.raises(ValueError, match="RESOURCE_DEFAULT_ACCESS_LEVEL"):
        validate_access_level_settings(
            allowed_levels=["trusted", "restricted"],
            default_level="public",
            external_default="trusted",
        )


def test_settings_access_levels_reject_an_external_default_outside_the_list():
    """The external API creates rooms at its own default, which the list covers too."""
    with pytest.raises(ValueError, match="EXTERNAL_API_DEFAULT_ACCESS_LEVEL"):
        validate_access_level_settings(
            allowed_levels=["restricted"],
            default_level="restricted",
            external_default="trusted",
        )


def test_settings_access_levels_mirror_the_model():
    """The list settings validate against has to be the model's own."""
    assert ROOM_ACCESS_LEVELS == RoomAccessLevel.values


def test_settings_access_levels_reject_an_unknown_level():
    """A typo removes a level, so it stops the boot rather than the picker."""
    with pytest.raises(ValueError, match="restrcited"):
        validate_access_level_settings(
            allowed_levels=["trusted", "restrcited"],
            default_level="trusted",
            external_default="trusted",
        )
