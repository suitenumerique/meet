"""Unit tests for the LIVEKIT_MAX_PIXEL_DENSITY setting value."""

import pytest

from meet.settings import PixelDensityValue


@pytest.mark.parametrize("raw,expected", [("1", 1.0), ("2", 2.0), ("1.5", 1.5)])
def test_pixel_density_value_parses(raw, expected):
    """A density of at least 1 is parsed as a float."""
    # environ=False keeps __new__ from resolving the value, so the instance survives.
    assert PixelDensityValue(environ=False).to_python(raw) == expected


@pytest.mark.parametrize("raw", ["0.5", "0", "-1"])
def test_pixel_density_value_rejects_below_one(raw):
    """A density below 1 stops the settings module loading."""
    with pytest.raises(ValueError, match="must be at least 1"):
        PixelDensityValue(environ=False).to_python(raw)
