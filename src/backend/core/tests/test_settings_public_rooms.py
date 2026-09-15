"""Test the public rooms settings guards, run at boot."""

import pytest

from meet.settings import (
    validate_public_rooms_settings,
    warn_unregistered_rooms_settings,
)


@pytest.mark.parametrize(
    "name", ["RESOURCE_DEFAULT_ACCESS_LEVEL", "EXTERNAL_API_DEFAULT_ACCESS_LEVEL"]
)
def test_settings_public_rooms_reject_a_public_default(name):
    """Either default that creates rooms is refused, and only where public rooms are off."""
    validate_public_rooms_settings(True, **{name: "public"})

    with pytest.raises(ValueError, match=name):
        validate_public_rooms_settings(False, **{name: "public"})


def test_settings_public_rooms_warn_on_unregistered_rooms():
    """An instance forbidding public rooms is told what its unregistered rooms answer."""
    with pytest.warns(UserWarning, match="ALLOW_UNREGISTERED_ROOMS"):
        warn_unregistered_rooms_settings(False, True)


@pytest.mark.parametrize(
    "allow_public_rooms,allow_unregistered_rooms",
    [(True, True), (True, False), (False, False)],
)
def test_settings_public_rooms_warn_on_nothing_else(
    allow_public_rooms, allow_unregistered_rooms, recwarn
):
    """Every other pairing is silent, so the warning names one instance to repair."""
    warn_unregistered_rooms_settings(allow_public_rooms, allow_unregistered_rooms)

    assert len(recwarn) == 0
