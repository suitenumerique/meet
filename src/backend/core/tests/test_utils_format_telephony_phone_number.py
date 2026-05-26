"""
Test utils._format_telephony_phone_number
"""

import logging

import pytest

from core.utils import _format_telephony_phone_number


@pytest.fixture(autouse=True)
def clear_lru_cache():
    """Clear the lru_cache before each test to ensure isolation."""
    _format_telephony_phone_number.cache_clear()
    yield
    _format_telephony_phone_number.cache_clear()


def test_format_telephony_phone_number_missing_raw_number():
    """Returns (None, None) when raw_number is empty."""
    country, international = _format_telephony_phone_number("", "FR")
    assert country is None
    assert international is None


def test_format_telephony_phone_number_none_raw_number():
    """Returns (None, None) when raw_number is None."""
    country, international = _format_telephony_phone_number(None, "FR")
    assert country is None
    assert international is None


def test_format_telephony_phone_number_missing_default_country():
    """Returns (None, None) when default_country is empty."""
    country, international = _format_telephony_phone_number("+33123456789", "")
    assert country is None
    assert international is None


def test_format_telephony_phone_number_none_default_country():
    """Returns (None, None) when default_country is None."""
    country, international = _format_telephony_phone_number("+33123456789", None)
    assert country is None
    assert international is None


def test_format_telephony_phone_number_both_missing():
    """Returns (None, None) when both inputs are missing."""
    country, international = _format_telephony_phone_number(None, None)
    assert country is None
    assert international is None


def test_format_telephony_phone_number_invalid_number(caplog):
    """Returns (None, None) and logs a warning when the number cannot be parsed."""

    with caplog.at_level(logging.WARNING):
        country, international = _format_telephony_phone_number("not-a-number", "FR")

    assert country is None
    assert international is None
    assert "not-a-number" in caplog.text
    assert "FR" in caplog.text


def test_format_telephony_phone_number_valid_french_number():
    """Returns correct country and international format for a valid French number."""
    country, international = _format_telephony_phone_number("0123456789", "FR")
    assert country == "FR"
    assert international == "+33 1 23 45 67 89"


def test_format_telephony_phone_number_valid_e164_number():
    """Returns correct result for an E.164-formatted number (no default country needed)."""
    country, international = _format_telephony_phone_number("+33123456789", "US")
    assert country == "FR"
    assert international == "+33 1 23 45 67 89"


def test_format_telephony_phone_number_valid_us_number():
    """Returns correct country and international format for a valid US number."""
    country, international = _format_telephony_phone_number("2025550123", "US")
    assert country == "US"
    assert international == "+1 202-555-0123"


def test_format_telephony_phone_number_valid_german_number():
    """Returns correct country and international format for a valid German number."""
    country, international = _format_telephony_phone_number("03012345678", "DE")
    assert country == "DE"
    assert international == "+49 30 12345678"


def test_format_telephony_phone_number_lru_cache():
    """Results are cached: the same inputs return the same object."""
    result1 = _format_telephony_phone_number("0123456789", "FR")
    result2 = _format_telephony_phone_number("0123456789", "FR")
    assert result1 is result2
    # pylint: disable=no-value-for-parameter
    cache_info = _format_telephony_phone_number.cache_info()
    assert cache_info.hits >= 1
