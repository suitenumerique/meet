"""Tests for the per-recording encoding resolution in BaseEgressService."""

# pylint: disable=protected-access,redefined-outer-name,unused-argument

from unittest.mock import Mock

from django.conf import settings

import pytest
from pydantic import ValidationError as PydanticValidationError

from core.api.serializers import EncodingConfig
from core.recording.worker.services import (
    VideoCompositeEgressService,
    resolve_encoding_config,
)


def make_config():
    """Build a minimal WorkerServiceConfig-like mock for service instantiation."""
    config = Mock()
    config.bucket_args = {
        "endpoint": "https://s3.test.com",
        "access_key": "test_key",
        "secret": "test_secret",
        "region": "test-region",
        "bucket": "test-bucket",
        "force_path_style": True,
    }
    config.encoding_options = None
    return config


@pytest.fixture
def service():
    """Return a VideoCompositeEgressService with mocked handle_request."""
    svc = VideoCompositeEgressService(make_config())
    svc._handle_request = Mock()
    return svc


# --- resolve_encoding_config ---


def test_resolve_config_returns_none_without_config():
    """Resolver should return None when no encoding config is provided."""
    assert resolve_encoding_config(None) is None


def test_resolve_config_without_profile_omits_profile_fields():
    """A resolution-only config should resolve dimensions but no framerate/bitrate."""
    resolved = resolve_encoding_config(EncodingConfig(resolution="720p"))

    assert resolved == {
        "key_frame_interval": settings.RECORDING_ENCODING_KEY_FRAME_INTERVAL_S,
        "width": 1280,
        "height": 720,
    }


def test_encoding_config_requires_resolution():
    """A profile-only or empty encoding config should be rejected at validation."""
    with pytest.raises(PydanticValidationError):
        EncodingConfig(profile="mixed")
    with pytest.raises(PydanticValidationError):
        EncodingConfig()


# --- _resolve_encoding_options ---


@pytest.mark.parametrize("encoding_options", [None, {}])
def test_resolve_options_returns_none_when_empty(service, encoding_options):
    """Resolver should return None when the resolved dict is empty or missing."""
    assert service._resolve_encoding_options(encoding_options) is None


@pytest.mark.parametrize(
    "resolution",
    list(settings.RECORDING_ENCODING_AVAILABLE_RESOLUTIONS),
)
@pytest.mark.parametrize(
    "profile",
    list(settings.RECORDING_ENCODING_AVAILABLE_PROFILES),
)
def test_resolve_profile_resolution_combinations(service, profile, resolution):
    """Every (profile, resolution) pair should resolve to the values from settings."""
    expected_width, expected_height = settings.RECORDING_ENCODING_AVAILABLE_RESOLUTIONS[
        resolution
    ]
    expected_fps, kbps_by_resolution = settings.RECORDING_ENCODING_AVAILABLE_PROFILES[
        profile
    ]
    expected_bitrate = kbps_by_resolution[resolution]

    resolved = resolve_encoding_config(
        EncodingConfig(resolution=resolution, profile=profile)
    )
    result = service._resolve_encoding_options(resolved)

    assert result.width == expected_width
    assert result.height == expected_height
    assert result.framerate == expected_fps
    assert result.video_bitrate == expected_bitrate


def test_resolve_options_none_profile_uses_livekit_defaults(service):
    """Missing profile should pass 0 fps/bitrate (LiveKit protobuf default)."""
    resolved = resolve_encoding_config(EncodingConfig(resolution="720p"))
    result = service._resolve_encoding_options(resolved)
    assert result.width == 1280
    assert result.height == 720
    assert result.framerate == 0
    assert result.video_bitrate == 0
