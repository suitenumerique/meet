"""Tests for the per-recording encoding resolution in BaseEgressService."""

# pylint: disable=protected-access,redefined-outer-name,unused-argument

from unittest.mock import Mock

from django.conf import settings

import pytest
from livekit import api as livekit_api
from pydantic import ValidationError as PydanticValidationError

from core.api.serializers import EncodingConfig
from core.recording.worker.factories import build_encoding_options
from core.recording.worker.services import VideoCompositeEgressService


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


# --- build_encoding_options ---


def test_build_options_without_profile_omits_profile_fields():
    """A resolution-only config should resolve dimensions but no framerate/bitrate.

    The profile-independent fields (audio bitrate, keyframe interval, codec /
    frequency pins) are always present, matching the default encoding.
    """
    resolved = build_encoding_options("720p", None)

    assert resolved == {
        "audio_bitrate": settings.RECORDING_ENCODING_AUDIO_BITRATE_KBPS,
        "key_frame_interval": settings.RECORDING_ENCODING_KEY_FRAME_INTERVAL_S,
        "video_codec": livekit_api.VideoCodec.H264_MAIN,
        "audio_codec": livekit_api.AudioCodec.AAC,
        "audio_frequency": 48000,
        "width": 1280,
        "height": 720,
    }
    assert "framerate" not in resolved
    assert "video_bitrate" not in resolved


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
    resolution_config = settings.RECORDING_ENCODING_AVAILABLE_RESOLUTIONS[resolution]
    expected_width = resolution_config["width"]
    expected_height = resolution_config["height"]
    profile_config = settings.RECORDING_ENCODING_AVAILABLE_PROFILES[profile]
    expected_fps = profile_config["fps"]
    expected_bitrate = profile_config["kbps"][resolution]

    resolved = build_encoding_options(resolution, profile)
    result = service._resolve_encoding_options(resolved)

    assert result.width == expected_width
    assert result.height == expected_height
    assert result.framerate == expected_fps
    assert result.video_bitrate == expected_bitrate
    # Profile-independent fields match the default encoding, never dropped.
    assert result.audio_bitrate == settings.RECORDING_ENCODING_AUDIO_BITRATE_KBPS
    assert result.video_codec == livekit_api.VideoCodec.H264_MAIN
    assert result.audio_codec == livekit_api.AudioCodec.AAC
    assert result.audio_frequency == 48000


def test_resolve_options_none_profile_uses_livekit_defaults(service):
    """Missing profile should pass 0 fps/bitrate (LiveKit protobuf default).

    The pinned codec / audio fields are still applied even without a profile.
    """
    resolved = build_encoding_options("720p", None)
    result = service._resolve_encoding_options(resolved)
    assert result.width == 1280
    assert result.height == 720
    assert result.framerate == 0
    assert result.video_bitrate == 0
    assert result.audio_bitrate == settings.RECORDING_ENCODING_AUDIO_BITRATE_KBPS
    assert result.video_codec == livekit_api.VideoCodec.H264_MAIN
    assert result.audio_codec == livekit_api.AudioCodec.AAC
