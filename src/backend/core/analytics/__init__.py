"""
Pluggable analytics.

Usage anywhere in the codebase:

    from core import analytics

    analytics.capture(request.user, "room_created", {"room_id": str(room.pk)})

The concrete backend is resolved lazily from Django settings, so swapping
PostHog for anything else is a configuration change, not a code change.
"""

from functools import lru_cache

from django.conf import settings
from django.utils.module_loading import import_string

from .base import AnalyticsBackend, NoOpAnalytics
from .events import AnalyticsEvent

__all__ = [
    "get_analytics",
    "identify",
    "capture",
    "AnalyticsBackend",
    "AnalyticsEvent",
]


@lru_cache(maxsize=1)
def get_analytics() -> AnalyticsBackend:
    """Instantiate the configured backend once per process."""
    dotted_path = getattr(settings, "ANALYTICS_BACKEND", None)
    options = getattr(settings, "ANALYTICS_BACKEND_SETTINGS", {}) or {}

    if not dotted_path:
        return NoOpAnalytics()

    backend_class = import_string(dotted_path)
    return backend_class(**options)


# Convenience module-level shortcuts


def identify(user, properties=None) -> None:
    """Associate traits with an identified user."""
    get_analytics().identify(user, properties)


def capture(user, event: AnalyticsEvent, properties=None) -> None:
    """Record an event performed by an identified user."""
    get_analytics().capture(user, event, properties)
