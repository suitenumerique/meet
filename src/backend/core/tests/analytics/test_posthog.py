"""
Unit tests for PostHogAnalytics.
"""

# pylint: disable=redefined-outer-name,unused-argument,protected-access

from unittest.mock import patch

from django.contrib.auth.models import AnonymousUser

import pytest

from core.analytics.events import AnalyticsEvent
from core.analytics.posthog import PostHogAnalytics
from core.analytics.user_feature_flags import UserFeatureFlag
from core.factories import UserFactory

pytestmark = pytest.mark.django_db


# ==============================
# __init__
# ==============================


@patch("core.analytics.posthog.Posthog")
def test_init_constructs_posthog_client_with_api_key_and_host(mock_posthog_cls):
    """Should forward api_key and host to the Posthog SDK constructor."""
    PostHogAnalytics(api_key="my-key", host="https://custom.i.posthog.com")

    mock_posthog_cls.assert_called_once_with(
        project_api_key="my-key",
        host="https://custom.i.posthog.com",
    )


@patch("core.analytics.posthog.Posthog")
def test_init_defaults_to_eu_host(mock_posthog_cls):
    """Should default host to the EU PostHog cloud when not specified."""
    PostHogAnalytics(api_key="my-key")

    _, kwargs = mock_posthog_cls.call_args
    assert kwargs["host"] == "https://eu.i.posthog.com"


@patch("core.analytics.posthog.Posthog")
def test_init_forwards_extra_kwargs_to_client(mock_posthog_cls):
    """Should pass through arbitrary extra kwargs (e.g. debug, disabled) to the SDK."""
    PostHogAnalytics(api_key="my-key", debug=True, disabled=False)

    _, kwargs = mock_posthog_cls.call_args
    assert kwargs["debug"] is True
    assert kwargs["disabled"] is False


# ==============================
# _distinct_id
# ==============================


@patch("core.analytics.posthog.Posthog")
def test_distinct_id_returns_none_for_none_user(mock_posthog_cls):
    """Should return None when user is None."""
    backend = PostHogAnalytics(api_key="test-api-key")

    assert backend._distinct_id(None) is None


@patch("core.analytics.posthog.Posthog")
def test_distinct_id_returns_none_for_anonymous_user(mock_posthog_cls):
    """Should return None when user.is_authenticated is falsy."""
    backend = PostHogAnalytics(api_key="test-api-key")

    assert backend._distinct_id(AnonymousUser()) is None


@patch("core.analytics.posthog.Posthog")
def test_distinct_id_returns_none_when_attribute_missing(mock_posthog_cls):
    """Should return None when the user object has no is_authenticated attribute at all."""
    backend = PostHogAnalytics(api_key="test-api-key")

    assert backend._distinct_id(object()) is None


@patch("core.analytics.posthog.Posthog")
def test_distinct_id_returns_stringified_pk_for_authenticated_user(mock_posthog_cls):
    """Should return str(user.pk) for an authenticated user."""
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()

    assert backend._distinct_id(user) == str(user.pk)


# ==============================
# identify
# ==============================


@patch("core.analytics.posthog.Posthog")
def test_identify_noop_for_anonymous_user(mock_posthog_cls):
    """Should not call the SDK when the user is anonymous."""
    backend = PostHogAnalytics(api_key="test-api-key")

    backend.identify(AnonymousUser(), {"email": "a@example.com"})

    mock_posthog_cls.return_value.set.assert_not_called()


@patch("core.analytics.posthog.Posthog")
def test_identify_noop_for_none_user(mock_posthog_cls):
    """Should not call the SDK when user is None."""
    backend = PostHogAnalytics(api_key="test-api-key")

    backend.identify(None, {"email": "a@example.com"})

    mock_posthog_cls.return_value.set.assert_not_called()


@patch("core.analytics.posthog.Posthog")
def test_identify_sends_set_properties_for_authenticated_user(mock_posthog_cls):
    """Should call capture with event=$identify and properties wrapped in $set."""
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()

    backend.identify(user, {"email": "a@example.com", "name": "A"})

    mock_posthog_cls.return_value.set.assert_called_once_with(
        distinct_id=str(user.pk),
        properties={"email": "a@example.com", "name": "A"},
    )


@patch("core.analytics.posthog.Posthog")
def test_identify_defaults_properties_to_empty_dict(mock_posthog_cls):
    """Should send an empty $set payload when properties is None."""
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()

    backend.identify(user, None)

    mock_posthog_cls.return_value.set.assert_called_once_with(
        distinct_id=str(user.pk),
        properties={},
    )


@patch("core.analytics.posthog.Posthog")
def test_identify_swallows_sdk_exceptions(mock_posthog_cls):
    """Should log and not raise when the SDK call fails."""
    mock_posthog_cls.return_value.set.side_effect = RuntimeError("network down")
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()

    # Must not propagate.
    backend.identify(user, {"email": "a@example.com"})


# ==============================
# capture
# ==============================


@patch("core.analytics.posthog.Posthog")
def test_capture_noop_for_anonymous_user(mock_posthog_cls):
    """Should not call the SDK when the user is anonymous."""
    backend = PostHogAnalytics(api_key="test-api-key")

    backend.capture(AnonymousUser(), AnalyticsEvent.ROOM_CREATED, {"room_id": "1"})

    mock_posthog_cls.return_value.capture.assert_not_called()


@patch("core.analytics.posthog.Posthog")
def test_capture_noop_for_none_user(mock_posthog_cls):
    """Should not call the SDK when user is None."""
    backend = PostHogAnalytics(api_key="test-api-key")

    backend.capture(None, AnalyticsEvent.ROOM_CREATED, {"room_id": "1"})

    mock_posthog_cls.return_value.capture.assert_not_called()


@patch("core.analytics.posthog.Posthog")
def test_capture_sends_event_and_properties_for_authenticated_user(mock_posthog_cls):
    """Should call capture with the distinct_id, event name, and properties."""
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()

    backend.capture(user, AnalyticsEvent.ROOM_CREATED, {"room_id": "room-1"})

    mock_posthog_cls.return_value.capture.assert_called_once_with(
        distinct_id=str(user.pk),
        event="room_created",
        properties={"room_id": "room-1"},
    )


@patch("core.analytics.posthog.Posthog")
def test_capture_serializes_event_enum_to_plain_string(mock_posthog_cls):
    """Should send the wire string, not the AnalyticsEvent enum member, to the SDK."""
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()

    backend.capture(user, AnalyticsEvent.ROOM_CREATED)

    _, kwargs = mock_posthog_cls.return_value.capture.call_args
    assert kwargs["event"] == "room_created"
    assert isinstance(
        kwargs["event"], str
    )  # not AnalyticsEvent, not StrEnum subclass leaking through


@patch("core.analytics.posthog.Posthog")
def test_capture_defaults_properties_to_empty_dict(mock_posthog_cls):
    """Should send an empty properties dict when properties is None."""
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()

    backend.capture(user, AnalyticsEvent.ROOM_CREATED, None)

    mock_posthog_cls.return_value.capture.assert_called_once_with(
        distinct_id=str(user.pk),
        event="room_created",
        properties={},
    )


@patch("core.analytics.posthog.Posthog")
def test_capture_swallows_sdk_exceptions(mock_posthog_cls):
    """Should log and not raise when the SDK call fails."""
    mock_posthog_cls.return_value.capture.side_effect = RuntimeError("network down")
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()

    # Must not propagate.
    backend.capture(user, AnalyticsEvent.ROOM_CREATED, {"room_id": "1"})


@patch("core.analytics.posthog.Posthog")
def test_capture_logs_the_failing_event_name_on_exception(mock_posthog_cls, caplog):
    """Should log which event failed, to aid debugging without crashing the caller."""
    mock_posthog_cls.return_value.capture.side_effect = RuntimeError("network down")
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()

    with caplog.at_level("ERROR"):
        backend.capture(user, AnalyticsEvent.ROOM_CREATED)

    assert any("PostHog capture failed" in record.message for record in caplog.records)


# ==============================
# feature flags
# ==============================


@patch("core.analytics.posthog.Posthog")
def test_compute_feature_flags_returns_all_catalog_entries(mock_posthog_cls):
    """Should map every declared feature flag key to the SDK evaluated value."""
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()

    mock_posthog_cls.return_value.evaluate_flags.return_value.get_flag.return_value = (
        True
    )

    flags = backend._fetch_user_feature_flags(user)

    assert flags == {UserFeatureFlag.TRANSCRIPT_SUMMARY_ENABLED: True}
    mock_posthog_cls.return_value.evaluate_flags.assert_called_once_with(str(user.pk))
    mock_posthog_cls.return_value.evaluate_flags.return_value.get_flag.assert_called_once_with(
        UserFeatureFlag.TRANSCRIPT_SUMMARY_ENABLED.value
    )


@patch("core.analytics.posthog.cache.get_or_set")
@patch("core.analytics.posthog.Posthog")
def test_get_feature_flags_uses_cache_get_or_set(
    mock_posthog_cls, mock_cache_get_or_set
):
    """Should cache feature flags by user distinct id with configured TTL."""
    cached_flags = {UserFeatureFlag.TRANSCRIPT_SUMMARY_ENABLED: False}
    mock_cache_get_or_set.return_value = cached_flags
    backend = PostHogAnalytics(api_key="test-api-key", feature_flags_cache_ttl=120)
    user = UserFactory()

    flags = backend.get_user_feature_flags(user)

    assert flags == cached_flags
    mock_cache_get_or_set.assert_called_once()
    args, kwargs = mock_cache_get_or_set.call_args
    assert kwargs["timeout"] == 120
    assert args[0] == f"user_feature_flags:{user.pk}"
    assert callable(kwargs["default"])


@patch("core.analytics.posthog.Posthog")
def test_get_feature_flags_returns_empty_dict_on_exception(mock_posthog_cls):
    """Should swallow failures and return an empty mapping."""
    backend = PostHogAnalytics(api_key="test-api-key")
    user = UserFactory()
    with patch("core.analytics.posthog.cache.get_or_set", side_effect=RuntimeError):
        assert backend.get_user_feature_flags(user) == {}


# ==============================
# shutdown
# ==============================


@patch("core.analytics.posthog.Posthog")
def test_shutdown_flushes_the_client(mock_posthog_cls):
    """Should delegate to the SDK's shutdown to flush pending events."""
    backend = PostHogAnalytics(api_key="test-api-key")

    backend.shutdown()

    mock_posthog_cls.return_value.shutdown.assert_called_once()
