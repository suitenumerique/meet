"""Unit tests for the settings of the circuit breakers of the LiveKit clusters."""

from unittest import mock

import pytest

from meet.settings import Test


@pytest.mark.parametrize(
    "setting_name",
    ("LIVEKIT_BREAKER_FAILURE_THRESHOLD", "LIVEKIT_BREAKER_OPEN_SECONDS"),
)
def test_livekit_breaker_settings_zero_is_refused(setting_name):
    """A breaker opening before any failure, or opening for no time, would
    refuse every call or none, so 0 stops the settings loading."""
    with mock.patch.object(Test, setting_name, 0):
        with pytest.raises(ValueError, match=f"{setting_name} must be at least 1"):
            Test.post_setup()


def test_livekit_breaker_disabled_in_tests():
    """Breakers keep their state in the cache, which tests running at the same
    time share, so tests enable them only with cluster names of their own."""
    assert Test.LIVEKIT_BREAKER_ENABLED is False
