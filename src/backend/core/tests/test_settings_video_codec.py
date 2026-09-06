"""Unit tests for the LIVEKIT_DEFAULT_VIDEO_CODEC setting value."""

import pytest

from meet.settings import VideoCodecValue


@pytest.mark.parametrize(
    "raw,expected",
    [("vp9", "vp9"), ("AV1", "av1"), ("  h264  ", "h264")],
)
def test_video_codec_value_normalizes(raw, expected):
    """Whitespace is trimmed and the name is lowercased before it is checked."""
    # environ=False keeps __new__ from resolving the value, so the instance survives.
    assert VideoCodecValue(environ=False).to_python(raw) == expected


@pytest.mark.parametrize("raw", ["vp10", "", "h.264"])
def test_video_codec_value_rejects_unsupported(raw):
    """A name outside the accepted list stops the settings module loading."""
    with pytest.raises(ValueError, match="Unsupported video codec"):
        VideoCodecValue(environ=False).to_python(raw)
