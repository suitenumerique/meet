"""Unit tests for the LIVEKIT_API_TIMEOUT_SECONDS setting."""

from unittest import mock

import pytest

from meet.settings import Test


def test_livekit_api_timeout_zero_is_refused():
    """A zero timeout would fail every LiveKit call, so it stops the settings loading."""
    with mock.patch.object(Test, "LIVEKIT_API_TIMEOUT_SECONDS", 0):
        with pytest.raises(ValueError, match="LIVEKIT_API_TIMEOUT_SECONDS"):
            Test.post_setup()
