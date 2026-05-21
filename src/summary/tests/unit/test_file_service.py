"""Unit tests for the file service."""

from pathlib import Path

import pytest

from summary.core.file_service import (
    MediaInfo,
    extract_audio_from_video,
    get_media_info,
)

BASE_PATH = Path(__file__).parent.parent / "assets"

MEDIA_INFO_SAMPLE_VISIO = MediaInfo(
    path=BASE_PATH / "video-sample-visio.mp4",
    has_audio=True,
    has_video=True,
    audio_duration_seconds=5.34059,
    audio_codec_name="aac",
)


@pytest.mark.parametrize(
    "media_info",
    [
        MediaInfo(
            path=BASE_PATH / "audio-sample-android-chrome.webm",
            has_audio=True,
            has_video=False,
            audio_duration_seconds=2.2795,
            audio_codec_name="opus",
        ),
        MediaInfo(
            path=BASE_PATH / "audio-sample-android-firefox.ogg",
            has_audio=True,
            has_video=False,
            audio_duration_seconds=2.3025,
            audio_codec_name="opus",
        ),
        MediaInfo(
            path=BASE_PATH / "audio-sample-android.m4a",
            has_audio=True,
            has_video=False,
            audio_duration_seconds=1.38,
            audio_codec_name="aac",
        ),
        MediaInfo(
            path=BASE_PATH / "audio-sample-chromium.webm",
            has_audio=True,
            has_video=False,
            audio_duration_seconds=2.65,
            audio_codec_name="opus",
        ),
        MediaInfo(
            path=BASE_PATH / "audio-sample-firefox.ogg",
            has_audio=True,
            has_video=False,
            audio_duration_seconds=2.0865,
            audio_codec_name="opus",
        ),
        MediaInfo(
            path=BASE_PATH / "audio-sample-ios-browser.webm",
            has_audio=True,
            has_video=False,
            audio_duration_seconds=2.6229,
            audio_codec_name="opus",
        ),
        MediaInfo(
            path=BASE_PATH / "audio-sample-ios.m4a",
            has_audio=True,
            has_video=False,
            audio_duration_seconds=1.408,
            audio_codec_name="aac",
        ),
        MediaInfo(
            path=BASE_PATH / "audio-sample-mac-os-safari.webm",
            has_audio=True,
            has_video=False,
            audio_duration_seconds=2.3049,
            audio_codec_name="opus",
        ),
        MEDIA_INFO_SAMPLE_VISIO,
    ],
)
def test_validate_media_info_supports_all_used_file_formats(
    media_info: MediaInfo,
) -> None:
    """Validate media_info for different files that the service can handle."""
    res = get_media_info(media_info.path)
    assert res.has_audio == media_info.has_audio
    assert res.has_video == media_info.has_video
    assert res.audio_codec_name == media_info.audio_codec_name
    if res.has_audio:
        assert res.audio_duration_seconds == pytest.approx(
            media_info.audio_duration_seconds, 1e-3
        )
    else:
        assert res.audio_duration_seconds is None


def test_media_info_invalid_file() -> None:
    """Test that media_info returns correct values for invalid files."""
    assert get_media_info(Path(__file__)) == MediaInfo(
        path=Path(__file__),
        has_audio=False,
        has_video=False,
        audio_duration_seconds=None,
        audio_codec_name=None,
    )


def test_extract_audio_from_video():
    """Test that extract_audio_from_video can extract audio from a video file."""
    path = None
    # A bit of cleanup logic since this is not a generator
    try:
        path = extract_audio_from_video(MEDIA_INFO_SAMPLE_VISIO)
        assert path.name.endswith(".m4a")
    except Exception as e:
        pytest.fail(f"Failed to extract audio from video: {e}")
    finally:
        if path and path.exists():
            path.unlink()
