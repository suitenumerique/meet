"""Analytics backend protocol and default no-op implementation."""

from abc import ABC, abstractmethod
from typing import Any, Mapping

from ..models import User
from .events import AnalyticsEvent
from .user_feature_flags import UserFeatureFlag


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

    def get_user_feature_flags(
        self,
        user: User,  # pylint: disable=unused-argument
    ) -> Mapping[UserFeatureFlag, bool | str | None]:
        """Return a dict of feature flags for the given user."""
        # We return an empty dict here by default to avoid a breaking change
        # By making this method abstract.
        return {}

    def is_user_feature_enabled(
        self, user: User, feature_name: UserFeatureFlag
    ) -> bool:
        """Check if a feature is enabled at the user level."""
        return self.get_user_feature_flags(user).get(feature_name, False) is True


class NoOpAnalytics(AnalyticsBackend):
    """
    Default backend: discards events and serves static feature flags.

    Feature flags can be declared without any analytics provider, e.g.:

        ANALYTICS_BACKEND_SETTINGS = {"feature_flags": {"summary-enabled": True}}
    """

    def __init__(
        self,
        *,
        feature_flags: Mapping[str, bool | str | None] | None = None,
        **_kwargs: Any,
    ) -> None:
        # Other settings are ignored, so that settings meant for another
        # backend never break an instance running without one.
        self._feature_flags = dict(feature_flags or {})

    def identify(self, user: User, properties=None) -> None:
        """No-op: discards identify calls."""

    def capture(self, user, event, properties=None) -> None:
        """No-op: discards captured events."""

    def shutdown(self) -> None:
        """No-op: nothing to flush."""

    def get_user_feature_flags(
        self,
        user: User,
    ) -> Mapping[UserFeatureFlag, bool | str | None]:
        """Return the feature flags declared in settings, for any user."""
        return self._feature_flags
