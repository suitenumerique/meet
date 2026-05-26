"""
Test utils.build_telephony_config
"""

import logging

from core.utils import build_telephony_config


def test_build_telephony_config_disabled(settings):
    """Returns {"enabled": False} when telephony is disabled."""
    settings.ROOM_TELEPHONY_ENABLED = False
    config = build_telephony_config()
    assert config == {"enabled": False}


def test_build_telephony_config_enabled_with_valid_number(settings):
    """Returns full config with country and international number when telephony is enabled."""
    settings.ROOM_TELEPHONY_ENABLED = True
    settings.ROOM_TELEPHONY_PHONE_NUMBER = "0123456789"
    settings.ROOM_TELEPHONY_DEFAULT_COUNTRY = "FR"
    config = build_telephony_config()
    assert config == {
        "enabled": True,
        "default_country": "FR",
        "international_phone_number": "+33 1 23 45 67 89",
    }


def test_build_telephony_config_enabled_with_invalid_number(settings):
    """Returns {"enabled": False} when phone number cannot be parsed."""
    settings.ROOM_TELEPHONY_ENABLED = True
    settings.ROOM_TELEPHONY_PHONE_NUMBER = "not-a-number"
    settings.ROOM_TELEPHONY_DEFAULT_COUNTRY = "FR"
    config = build_telephony_config()
    assert config == {"enabled": False}


def test_build_telephony_config_enabled_with_missing_number(settings):
    """Returns {"enabled": False} when phone number is not configured."""
    settings.ROOM_TELEPHONY_ENABLED = True
    settings.ROOM_TELEPHONY_PHONE_NUMBER = ""
    settings.ROOM_TELEPHONY_DEFAULT_COUNTRY = "FR"
    config = build_telephony_config()
    assert config == {"enabled": False}


def test_build_telephony_config_enabled_with_missing_number_warns(settings, caplog):
    """Logs a warning when telephony is enabled but phone number is not configured."""

    settings.ROOM_TELEPHONY_ENABLED = True
    settings.ROOM_TELEPHONY_PHONE_NUMBER = ""
    settings.ROOM_TELEPHONY_DEFAULT_COUNTRY = "FR"

    with caplog.at_level(logging.WARNING):
        build_telephony_config()

    assert "ROOM_TELEPHONY_PHONE_NUMBER" in caplog.text
