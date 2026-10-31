"""
Unit tests for NoOpAnalytics and the analytics backend loader.
"""

# pylint: disable=redefined-outer-name,unused-argument

import pytest

from core.analytics import get_analytics
from core.analytics.base import NoOpAnalytics
from core.analytics.user_feature_flags import UserFeatureFlag
from core.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def clear_analytics_cache():
    """Clear the cached backend before and after each test."""
    get_analytics.cache_clear()
    yield
    get_analytics.cache_clear()


# ==============================
# NoOpAnalytics
# ==============================


def test_noop_has_no_feature_flags_by_default():
    """Should keep every feature flag disabled when none is declared."""
    backend = NoOpAnalytics()
    user = UserFactory()

    assert not backend.get_user_feature_flags(user)
    assert (
        backend.is_user_feature_enabled(
            user, UserFeatureFlag.TRANSCRIPT_SUMMARY_ENABLED
        )
        is False
    )


def test_noop_enables_declared_feature_flags():
    """Should enable a feature flag declared as True."""
    backend = NoOpAnalytics(feature_flags={"summary-enabled": True})
    user = UserFactory()

    assert backend.get_user_feature_flags(user) == {"summary-enabled": True}
    assert (
        backend.is_user_feature_enabled(
            user, UserFeatureFlag.TRANSCRIPT_SUMMARY_ENABLED
        )
        is True
    )


@pytest.mark.parametrize("value", [False, None, "true"])
def test_noop_only_enables_feature_flags_set_to_true(value):
    """Should keep a feature flag disabled unless its value is exactly True."""
    backend = NoOpAnalytics(feature_flags={"summary-enabled": value})
    user = UserFactory()

    assert (
        backend.is_user_feature_enabled(
            user, UserFeatureFlag.TRANSCRIPT_SUMMARY_ENABLED
        )
        is False
    )


def test_noop_ignores_unrelated_settings():
    """Should accept settings meant for another backend without failing."""
    backend = NoOpAnalytics(api_key="my-key", host="https://eu.i.posthog.com")

    assert not backend.get_user_feature_flags(UserFactory())


# ==============================
# get_analytics
# ==============================


def test_get_analytics_defaults_to_noop_without_feature_flags(settings):
    """Should return a no-op backend with no feature flag by default."""
    settings.ANALYTICS_BACKEND = None
    settings.ANALYTICS_BACKEND_SETTINGS = {}

    backend = get_analytics()

    assert isinstance(backend, NoOpAnalytics)
    assert not backend.get_user_feature_flags(UserFactory())


def test_get_analytics_passes_feature_flags_to_noop(settings):
    """Should forward the feature flags when no backend is configured."""
    settings.ANALYTICS_BACKEND = None
    settings.ANALYTICS_BACKEND_SETTINGS = {"feature_flags": {"summary-enabled": True}}

    backend = get_analytics()

    assert isinstance(backend, NoOpAnalytics)
    assert (
        backend.is_user_feature_enabled(
            UserFactory(), UserFeatureFlag.TRANSCRIPT_SUMMARY_ENABLED
        )
        is True
    )


def test_get_analytics_instantiates_configured_backend_with_settings(settings):
    """Should instantiate the configured backend with its settings."""
    settings.ANALYTICS_BACKEND = "core.analytics.base.NoOpAnalytics"
    settings.ANALYTICS_BACKEND_SETTINGS = {"feature_flags": {"summary-enabled": True}}

    backend = get_analytics()

    assert isinstance(backend, NoOpAnalytics)
    assert (
        backend.is_user_feature_enabled(
            UserFactory(), UserFeatureFlag.TRANSCRIPT_SUMMARY_ENABLED
        )
        is True
    )
