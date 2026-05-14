"""Analytics module."""

import logging
from enum import StrEnum

from django.conf import settings

import posthog

from core.models import User

logger = logging.getLogger(__name__)


class EventName(StrEnum):
    """Analytics event names."""

    TRANSCRIPT_GENERATION_SUCCESS = "transcript_generation_success"
    TRANSCRIPT_GENERATION_FAILURE = "transcript_generation_failure"
    SUMMARY_GENERATION_SUCCESS = "summary_generation_success"
    SUMMARY_GENERATION_FAILURE = "summary_generation_failure"


def capture_event(event_name: EventName, *, user: User, properties=None) -> None:
    """
    Capture an analytics event with user properties.
    """
    if not settings.POSTHOG_ENABLED:
        return

    properties = properties or {}
    properties["$set"] = {
        "name": user.full_name,
        "email": user.email,
        "sub": user.sub,
    }
    posthog.capture(event_name, distinct_id=user.id, properties=properties)


def is_feature_enabled(feature_name: str, distinct_id: str) -> bool:
    """Check if a feature flag is enabled for a user."""
    if not settings.POSTHOG_ENABLED:
        return False

    try:
        return posthog.feature_enabled(feature_name, distinct_id)
    except Exception as e:  # noqa: BLE001
        logger.error("Error checking feature flag %s: %s", feature_name, e)
        return False


__all__ = ["EventName", "capture_event", "is_feature_enabled"]
