"""Unit tests for the file service."""

from pathlib import Path

import pytest

from summary.core.file_service import get_media_duration


@pytest.mark.parametrize(
    "filename, duration",
    [
        ("audio-sample-android-chrome.webm", 2.2795),
        ("audio-sample-android-firefox.ogg", 2.3025),
        ("audio-sample-android.m4a", 1.38),
        ("audio-sample-chromium.webm", 2.65),
        ("audio-sample-firefox.ogg", 2.0865),
        ("audio-sample-ios-browser.webm", 2.6229),
        ("audio-sample-ios.m4a", 1.408),
        ("audio-sample-mac-os-safari.webm", 2.3049),
        ("video-sample-visio.mp4", 5.34059),
    ],
)
def test_validate_duration_supports_all_used_file_formats(
    filename: str, duration: float
) -> None:
    """Validate duration for Safari iPhone WebM files without format duration."""
    audio_path = Path(__file__).parent.parent / "assets" / filename

    assert get_media_duration(audio_path) == pytest.approx(duration, 1e-3)
