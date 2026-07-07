"""Analytics backend protocol and default no-op implementation."""

from abc import ABC, abstractmethod
from typing import Any

from ..models import User
from .events import AnalyticsEvent


class AnalyticsBackend(ABC):
    """
    Interface every analytics backend must implement.

    Backends are instantiated once (singleton) with the kwargs declared in
    settings.ANALYTICS_BACKEND_SETTINGS, e.g.:

        ANALYTICS_BACKEND = "core.analytics.posthog.PostHogAnalytics"
        ANALYTICS_BACKEND_SETTINGS = {"api_key": "...", "host": "..."}
    """

    @abstractmethod
    def identify(self, user: User, properties: dict[str, Any] | None = None) -> None:
        """Associate traits (email, name, ...) with an identified user."""

    @abstractmethod
    def capture(
        self,
        user: User,
        event: AnalyticsEvent,
        properties: dict[str, Any] | None = None,
    ) -> None:
        """Record an event performed by an identified user."""

    @abstractmethod
    def shutdown(self) -> None:
        """Flush pending events. Called on process exit."""


class NoOpAnalytics(AnalyticsBackend):
    """Default backend: silently discards everything."""

    def identify(self, user: User, properties=None) -> None:
        """No-op: discards identify calls."""

    def capture(self, user, event, properties=None) -> None:
        """No-op: discards captured events."""

    def shutdown(self) -> None:
        """No-op: nothing to flush."""
