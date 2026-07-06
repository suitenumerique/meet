"""PostHog implementation of the analytics backend protocol."""

import logging
from typing import Any, Mapping

from django.core.cache import cache

from posthog import Posthog

from ..models import User
from .base import AnalyticsBackend
from .events import AnalyticsEvent
from .user_feature_flags import UserFeatureFlag

logger = logging.getLogger(__name__)


class PostHogAnalytics(AnalyticsBackend):
    """Send events to PostHog, keyed on the user's primary key (UUID)."""

    def __init__(
        self,
        *,
        api_key: str,
        host: str = "https://eu.i.posthog.com",
        feature_flags_cache_ttl: int = 60,
        feature_flags_cache_prefix: str = "user_feature_flags:",
        **kwargs: Any,
    ) -> None:

        # The SDK batches and sends in a background thread by default,
        # so calls below never block the request/response cycle.
        self._client = Posthog(
            project_api_key=api_key,
            host=host,
            **kwargs,
        )
        self._feature_flags_cache_ttl = feature_flags_cache_ttl
        self._feature_flags_cache_prefix = feature_flags_cache_prefix

    @staticmethod
    def _distinct_id(user: User) -> str | None:
        """Return the PostHog distinct_id for a user, or None if anonymous."""
        if user is None or not getattr(user, "is_authenticated", False):
            return None
        return str(user.pk)

    def identify(self, user: User, properties: dict[str, Any] | None = None) -> None:
        """Associate traits (email, name, ...) with an identified user."""
        distinct_id = self._distinct_id(user)
        if distinct_id is None:
            return
        try:
            self._client.set(
                distinct_id=distinct_id,
                properties=properties or {},
            )
        except Exception:  # pylint: disable=broad-exception-caught
            logger.exception("PostHog identify failed")

    def capture(
        self,
        user: User,
        event: AnalyticsEvent,
        properties: dict[str, Any] | None = None,
    ) -> None:
        """Record an event performed by an identified user."""
        distinct_id = self._distinct_id(user)
        if distinct_id is None:
            return
        try:
            self._client.capture(
                distinct_id=distinct_id,
                event=str(event),
                properties=properties or {},
            )
        except Exception:  # pylint: disable=broad-exception-caught
            logger.exception("PostHog capture failed for event %s", event)

    def shutdown(self) -> None:
        """Flush pending events. Called on process exit."""
        self._client.shutdown()

    def _fetch_user_feature_flags(
        self, user: User
    ) -> Mapping[UserFeatureFlag, bool | str | None]:
        """Compute feature flags for a user."""

        distinct_id = self._distinct_id(user)
        if distinct_id is None:
            return {}

        flags = self._client.evaluate_flags(distinct_id)
        out: dict[UserFeatureFlag, bool | str | None] = {}
        for flag_key in UserFeatureFlag:
            out[flag_key] = flags.get_flag(flag_key.value)

        return out

    def get_user_feature_flags(
        self, user: User
    ) -> Mapping[UserFeatureFlag, bool | str | None]:
        """Get feature flags for a user. Caches the result for a short time."""
        distinct_id = self._distinct_id(user)
        if distinct_id is None:
            return {}

        try:
            return cache.get_or_set(
                f"{self._feature_flags_cache_prefix}{distinct_id}",
                default=lambda: self._fetch_user_feature_flags(user),
                timeout=self._feature_flags_cache_ttl,
            )
        except Exception:  # pylint: disable=broad-exception-caught
            logger.exception("Failed to get feature flags for user %s", user.pk)
            return {}
