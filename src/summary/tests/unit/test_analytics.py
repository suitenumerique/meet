"""Tests for the analytics client."""

import threading
import time
from unittest.mock import Mock

from summary.core import analytics as analytics_module
from summary.core.analytics import Analytics


def test_shutdown_flushes_the_posthog_client():
    """Shutting down should send the queued events through the PostHog client."""
    analytics = Analytics()
    analytics._client = Mock()

    analytics.shutdown()

    analytics._client.shutdown.assert_called_once_with()


def test_shutdown_stops_waiting_after_the_timeout():
    """Shutting down should not wait for an unresponsive PostHog past the timeout."""
    analytics = Analytics()
    analytics._client = Mock()
    stopping, unblock = threading.Event(), threading.Event()

    def hang():
        stopping.set()
        unblock.wait(10)

    analytics._client.shutdown.side_effect = hang

    started = time.monotonic()
    analytics.shutdown(timeout_seconds=0.1)
    elapsed = time.monotonic() - started
    unblock.set()

    assert stopping.wait(5)
    assert elapsed < 5


def test_shutdown_without_posthog_client(monkeypatch):
    """Shutting down disabled analytics should do nothing."""
    monkeypatch.setattr(
        analytics_module,
        "settings",
        analytics_module.settings.model_copy(update={"posthog_enabled": False}),
    )
    analytics = Analytics()

    assert analytics.is_disabled
    analytics.shutdown()
