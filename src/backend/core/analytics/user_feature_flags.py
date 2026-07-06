"""Catalog of all analytics feature flags used by the backend."""

from enum import StrEnum


class UserFeatureFlag(StrEnum):
    """All feature flags configured in the app."""

    TRANSCRIPT_SUMMARY_ENABLED = "summary-enabled"
