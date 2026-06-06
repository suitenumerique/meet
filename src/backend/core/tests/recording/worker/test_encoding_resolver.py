"""Tests for the encoding resolver methods in BaseEgressService."""

# pylint: disable=redefined-outer-name,unused-argument

from unittest.mock import Mock

import pytest

from core.recording.encodings import (
    AUDIO_BITRATE_MAP,
    ENCODING_MAP,
    RESOLUTION_MAP,
)
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


def make_encoding_config(resolution=None, profile=None):
    """Build a mock EncodingConfig-like object for resolver tests."""

    class FakeEncodingConfig:
        """Minimal stand-in for EncodingConfig used by the resolver."""

        def __init__(self, resolution_value, profile_value):
            self.resolution = resolution_value
            self.profile = profile_value

    return FakeEncodingConfig(resolution, profile)


@pytest.fixture
def service():
    """Return a VideoCompositeEgressService with mocked handle_request."""
    svc = VideoCompositeEgressService(make_config())
    svc._handle_request = Mock()
    return svc


# --- Map completeness ---


def test_all_resolutions_present():
    """All expected resolutions should be in RESOLUTION_MAP."""
    for res in ["540p", "720p", "1080p"]:
        assert res in RESOLUTION_MAP


def test_all_profiles_present_in_audio_map():
    """All expected profiles should be in AUDIO_BITRATE_MAP."""
    for profile in ["talking_heads", "text", "mixed"]:
        assert profile in AUDIO_BITRATE_MAP


def test_all_combinations_present_in_encoding_map():
    """Every resolution+profile combination should exist in ENCODING_MAP."""
    for res in ["540p", "720p", "1080p"]:
        for profile in ["talking_heads", "text", "mixed"]:
            assert (res, profile) in ENCODING_MAP


# --- resolve_encoding_options ---


def test_resolve_returns_none_when_no_config(service):
    """Resolver should return None when encoding_config is None."""
    assert service._resolve_encoding_options(None) is None


def test_resolve_mixed_720p(service):
    """mixed profile at 720p should map to correct dimensions and bitrate."""
    cfg = make_encoding_config(resolution="720p", profile="mixed")
    result = service._resolve_encoding_options(cfg)
    assert result.width == 1280
    assert result.height == 720
    assert result.framerate == 20
    assert result.video_bitrate == 1500
    assert result.audio_bitrate == 96


def test_resolve_talking_heads_540p(service):
    """talking_heads profile at 540p should map to lower bitrate."""
    cfg = make_encoding_config(resolution="540p", profile="talking_heads")
    result = service._resolve_encoding_options(cfg)
    assert result.width == 960
    assert result.height == 540
    assert result.framerate == 15
    assert result.video_bitrate == 400
    assert result.audio_bitrate == 64


def test_resolve_text_1080p(service):
    """text profile at 1080p should map to high bitrate."""
    cfg = make_encoding_config(resolution="1080p", profile="text")
    result = service._resolve_encoding_options(cfg)
    assert result.width == 1920
    assert result.height == 1080
    assert result.framerate == 15
    assert result.video_bitrate == 1800


def test_resolve_none_resolution_returns_none_dimensions(service):
    """Missing resolution should pass 0 width/height (LiveKit protobuf default)."""
    cfg = make_encoding_config(resolution=None, profile="mixed")
    result = service._resolve_encoding_options(cfg)
    assert result.width == 0
    assert result.height == 0


def test_resolve_none_profile_returns_none_bitrates(service):
    """Missing profile should pass 0 fps/bitrate (LiveKit protobuf default)."""
    cfg = make_encoding_config(resolution="720p", profile=None)
    result = service._resolve_encoding_options(cfg)
    assert result.framerate == 0
    assert result.video_bitrate == 0


# --- resolve_audio_encoding_options ---


def test_audio_resolve_returns_none_when_no_config(service):
    """Audio resolver should return None when encoding_config is None."""
    assert service._resolve_audio_encoding_options(None) is None


def test_audio_resolve_talking_heads(service):
    """talking_heads profile should apply 64 kbps audio bitrate."""
    cfg = make_encoding_config(profile="talking_heads")
    result = service._resolve_audio_encoding_options(cfg)
    assert result.audio_bitrate == 64


def test_audio_resolve_mixed(service):
    """mixed profile should apply 96 kbps audio bitrate."""
    cfg = make_encoding_config(profile="mixed")
    result = service._resolve_audio_encoding_options(cfg)
    assert result.audio_bitrate == 96


def test_audio_resolve_ignores_resolution(service):
    """Audio resolver should produce same result regardless of resolution."""
    cfg_with = make_encoding_config(resolution="1080p", profile="mixed")
    cfg_without = make_encoding_config(resolution=None, profile="mixed")
    assert (
        service._resolve_audio_encoding_options(cfg_with).audio_bitrate
        == service._resolve_audio_encoding_options(cfg_without).audio_bitrate
    )
