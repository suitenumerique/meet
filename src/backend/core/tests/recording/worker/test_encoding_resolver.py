"""Tests for the encoding resolver in core.recording.encodings."""

from core.recording.encodings import (
    PROFILE_MAP,
    RESOLUTION_MAP,
    resolve_encoding_options,
)


def make_encoding_config(resolution=None, profile=None):
    """Build a mock EncodingConfig-like object for resolver tests."""

    class FakeEncodingConfig:
        """Minimal stand-in for EncodingConfig used by the resolver."""

        def __init__(self, resolution_value, profile_value):
            self.resolution = resolution_value
            self.profile = profile_value

    cfg = FakeEncodingConfig(resolution, profile)
    return cfg


def test_resolve_returns_none_when_no_config():
    """Resolver should return None when no config is provided."""
    assert resolve_encoding_options(None) is None


def test_resolve_balanced_720p():
    """Balanced profile should map to 720p defaults when requested."""
    cfg = make_encoding_config(resolution="720p", profile="balanced")
    result = resolve_encoding_options(cfg)
    assert result.width == 1280
    assert result.height == 720
    assert result.framerate == 20
    assert result.video_bitrate == 1000
    assert result.audio_bitrate == 96


def test_resolve_low_cpu_540p():
    """Low CPU profile should map to 540p and lower bitrate."""
    cfg = make_encoding_config(resolution="540p", profile="low_cpu")
    result = resolve_encoding_options(cfg)
    assert result.width == 960
    assert result.height == 540
    assert result.framerate == 15
    assert result.video_bitrate == 600


def test_resolve_none_resolution_defaults_to_720p():
    """Missing resolution should default to 720p."""
    cfg = make_encoding_config(resolution=None, profile="balanced")
    result = resolve_encoding_options(cfg)
    assert result.width == 1280
    assert result.height == 720


def test_resolve_none_profile_defaults_to_balanced():
    """Missing profile should default to balanced."""
    cfg = make_encoding_config(resolution="720p", profile=None)
    result = resolve_encoding_options(cfg)
    assert result.framerate == 20  # balanced fps


def test_all_resolutions_present():
    """All expected resolutions should be in the map."""
    for res in ["1080p", "720p", "540p"]:
        assert res in RESOLUTION_MAP


def test_all_profiles_present():
    """All expected profiles should be in the map."""
    for profile in ["balanced", "slide_heavy", "low_cpu"]:
        assert profile in PROFILE_MAP
