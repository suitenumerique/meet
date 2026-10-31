"""Unit tests for the value of the LiveKit reconnection delay settings."""

import pytest

from meet.settings import StrictlyPositiveIntegerValue


@pytest.mark.parametrize("raw,expected", [("1", 1), (" 15000 ", 15000)])
def test_strictly_positive_integer_value_parses(raw, expected):
    """A delay above 0 is read as an integer."""
    assert StrictlyPositiveIntegerValue(environ=False).to_python(raw) == expected


def test_strictly_positive_integer_value_rejects_zero():
    """0 stops the settings module loading, unlike with PositiveIntegerValue."""
    with pytest.raises(ValueError, match="greater than 0"):
        StrictlyPositiveIntegerValue(environ=False).to_python("0")


@pytest.mark.parametrize("raw", ["-1", "1e3", "1000ms", ""])
def test_strictly_positive_integer_value_rejects_invalid(raw):
    """A negative or non-integer value stops the settings module loading."""
    with pytest.raises(ValueError):
        StrictlyPositiveIntegerValue(environ=False).to_python(raw)
