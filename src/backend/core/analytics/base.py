"""Analytics backend protocol and default no-op implementation."""

from typing import Any, Protocol

from .events import AnalyticsEvent


class AnalyticsBackend(Protocol):
    """
    Interface every analytics backend must implement.

    Backends are instantiated once (singleton) with the kwargs declared in
    settings.ANALYTICS_BACKEND_SETTINGS, e.g.:

        ANALYTICS_BACKEND = "core.analytics.posthog.PostHogAnalytics"
        ANALYTICS_BACKEND_SETTINGS = {"api_key": "...", "host": "..."}
    """

    def __init__(self, **kwargs: Any) -> None: ...

    def identify(self, user, properties: dict[str, Any] | None = None) -> None:
        """Associate traits (email, name, ...) with an identified user."""

    def capture(
        self,
        user,
        event: AnalyticsEvent,
        properties: dict[str, Any] | None = None,
    ) -> None:
        """Record an event performed by an identified user."""

    def shutdown(self) -> None:
        """Flush pending events. Called on process exit."""


class NoOpAnalytics:
    """Default backend: silently discards everything."""

    def __init__(self, **kwargs: Any) -> None:
        """No-op: accepts and ignores any backend settings kwargs."""

    def identify(self, user, properties=None) -> None:
        """No-op: discards identify calls."""

    def capture(self, user, event, properties=None) -> None:
        """No-op: discards captured events."""

    def shutdown(self) -> None:
        """No-op: nothing to flush."""
