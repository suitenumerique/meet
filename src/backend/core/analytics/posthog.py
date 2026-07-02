"""PostHog implementation of the analytics backend protocol."""

import logging
from typing import Any

from posthog import Posthog

from .events import AnalyticsEvent

logger = logging.getLogger(__name__)


class PostHogAnalytics:
    """Send events to PostHog, keyed on the user's primary key (UUID)."""

    def __init__(
        self,
        api_key: str,
        host: str = "https://eu.i.posthog.com",
        **kwargs: Any,
    ) -> None:

        # The SDK batches and sends in a background thread by default,
        # so calls below never block the request/response cycle.
        self._client = Posthog(
            project_api_key=api_key,
            host=host,
            **kwargs,
        )

    @staticmethod
    def _distinct_id(user) -> str | None:
        """Return the PostHog distinct_id for a user, or None if anonymous."""
        if user is None or not getattr(user, "is_authenticated", False):
            return None
        return str(user.pk)

    def identify(self, user, properties=None) -> None:
        """Associate traits (email, name, ...) with an identified user."""
        distinct_id = self._distinct_id(user)
        if distinct_id is None:
            return
        try:
            self._client.capture(
                distinct_id=distinct_id,
                event="$identify",
                properties={"$set": properties or {}},
            )
        except Exception:  # pylint: disable=broad-exception-caught
            logger.exception("PostHog identify failed")

    def capture(self, user, event: AnalyticsEvent, properties=None) -> None:
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
