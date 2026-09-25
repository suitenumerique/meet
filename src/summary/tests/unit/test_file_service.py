"""Unit tests for the file service."""

import json
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse

import pytest
from botocore.stub import Stubber

from summary.core import file_service
from summary.core.file_service import (
    FileService,
    MediaInfo,
    extract_audio_from_media,
    get_media_info,
)
from summary.core.shared_models import WhisperXResponse

BASE_PATH = Path(__file__).parent.parent / "assets"

MEDIA_INFO_SAMPLE_VISIO = MediaInfo(
    path=BASE_PATH / "video-sample-visio.mp4",
    has_audio=True,
    has_video=True,
    audio_duration_seconds=5.34059,
    audio_codec_name="aac",
)


S3Stubber = Callable[[str], Stubber]


@contextmanager
def override_settings(**values) -> Iterator[None]:
    """Replace the (frozen) settings read by the file service with a copy.

    Usable as a decorator or a context manager. The copy is taken on entry, so
    it applies on top of the settings already overridden by fixtures.
    """
    with patch.object(
        file_service, "settings", file_service.settings.model_copy(update=values)
    ):
        yield


@pytest.fixture
def s3_settings() -> Iterator[None]:
    """Configure the S3 settings read by the file service."""
    with override_settings(
        aws_s3_endpoint_url="garage:9000",
        aws_s3_secure_access=False,
        aws_s3_region_name="fr-par",
        aws_storage_bucket_name="meet-media-storage",
    ):
        yield


@pytest.fixture
def s3_stubber(
    monkeypatch: pytest.MonkeyPatch, s3_settings: None
) -> Iterator[S3Stubber]:
    """Stub the S3 clients built by the file service, one per signing region.

    Every client is stubbed, so an unexpected S3 call fails the test instead of
    reaching the network. Responses can be added for a region before the file
    service builds its client, e.g. for the bucket region lookup.
    """
    build_s3_client = file_service._build_s3_client
    stubbers: dict[str, Stubber] = {}

    def stubber(region_name: str) -> Stubber:
        if region_name not in stubbers:
            stubbers[region_name] = Stubber(build_s3_client(region_name))
            stubbers[region_name].activate()
        return stubbers[region_name]

    monkeypatch.setattr(
        file_service,
        "_build_s3_client",
        lambda region_name: stubber(region_name).client,
    )
    yield stubber
    for region_stubber in stubbers.values():
        region_stubber.assert_no_pending_responses()


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


def test_media_info_ignores_empty_stream_entry(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test stream parsing when ffprobe returns an empty stream object."""
    ffprobe_payload = {
        "programs": [],
        "stream_groups": [],
        "streams": [
            {"codec_name": "vorbis", "codec_type": "audio"},
            {},
        ],
    }

    run_mock = Mock(
        return_value=Mock(stdout=json.dumps(ffprobe_payload), stderr="", returncode=0)
    )
    monkeypatch.setattr(file_service.subprocess, "run", run_mock)
    monkeypatch.setattr(
        file_service, "get_media_duration_seconds", Mock(return_value=2.5)
    )

    media_info = get_media_info(BASE_PATH / "audio-sample-android-firefox.ogg")

    assert media_info.has_audio is True
    assert media_info.has_video is False
    assert media_info.has_bad_stream is True
    assert media_info.audio_codec_name == "vorbis"
    assert media_info.audio_duration_seconds == 2.5


def test_extract_audio_from_video():
    """Test that extract_audio_from_video can extract audio from a video file."""
    path = extract_audio_from_media(MEDIA_INFO_SAMPLE_VISIO)
    # A bit of cleanup logic since this is not a generator
    try:
        assert path.name.endswith(".m4a")
    finally:
        path.unlink(missing_ok=True)


@pytest.mark.parametrize(
    ("endpoint_url", "secure_access", "expected_endpoint_url"),
    [
        ("garage:9000", False, "http://garage:9000"),
        ("http://garage:9000/", False, "http://garage:9000"),
        ("s3.example.com", True, "https://s3.example.com"),
        ("http://s3.example.com", True, "https://s3.example.com"),
    ],
)
def test_s3_client_endpoint_follows_secure_access(
    s3_stubber: S3Stubber,
    endpoint_url: str,
    secure_access: bool,
    expected_endpoint_url: str,
) -> None:
    """The endpoint scheme is taken from aws_s3_secure_access, not from the URL."""
    with override_settings(
        aws_s3_endpoint_url=endpoint_url, aws_s3_secure_access=secure_access
    ):
        assert FileService()._s3_client.meta.endpoint_url == expected_endpoint_url


def test_s3_client_uses_configured_region(s3_stubber: S3Stubber) -> None:
    """A configured region is used as-is, without looking up the bucket."""
    assert FileService()._s3_client is s3_stubber("fr-par").client


@pytest.mark.parametrize(
    ("location_response", "expected_region"),
    [
        ({}, file_service.DEFAULT_S3_REGION_NAME),
        ({"LocationConstraint": "fr-par"}, "fr-par"),
    ],
)
@override_settings(aws_s3_region_name=None)
def test_s3_client_discovers_bucket_region(
    s3_stubber: S3Stubber,
    location_response: dict,
    expected_region: str,
) -> None:
    """Without a configured region, the bucket's region is used to sign requests."""
    s3_stubber(file_service.DEFAULT_S3_REGION_NAME).add_response(
        "get_bucket_location", location_response, {"Bucket": "meet-media-storage"}
    )

    assert FileService()._s3_client is s3_stubber(expected_region).client


def test_store_transcript(s3_stubber: S3Stubber) -> None:
    """The transcript is stored as JSON under the transcripts path."""
    transcript = WhisperXResponse(segments=())
    s3_stubber("fr-par").add_response(
        "put_object",
        {},
        {
            "Bucket": "meet-media-storage",
            "Key": "transcripts/job-1.json",
            "Body": transcript.model_dump_json().encode(),
        },
    )

    FileService().store_transcript(transcript=transcript, job_id="job-1")


def test_store_summary(s3_stubber: S3Stubber) -> None:
    """The summary is stored as text under the summaries path."""
    s3_stubber("fr-par").add_response(
        "put_object",
        {},
        {
            "Bucket": "meet-media-storage",
            "Key": "summaries/job-1.txt",
            "Body": b"The summary",
        },
    )

    FileService().store_summary(summary="The summary", job_id="job-1")


@pytest.mark.parametrize(
    ("method", "expected_path"),
    [
        ("get_transcript_signed_url", "/meet-media-storage/transcripts/job-1.json"),
        ("get_summary_signed_url", "/meet-media-storage/summaries/job-1.txt"),
    ],
)
def test_signed_urls(s3_stubber: S3Stubber, method: str, expected_path: str) -> None:
    """Signed URLs are path-style, SigV4-signed for the region, valid for a day."""
    url = urlparse(getattr(FileService(), method)("job-1"))
    query = parse_qs(url.query)

    assert url.scheme == "http"
    assert url.netloc == "garage:9000"
    assert url.path == expected_path
    assert query["X-Amz-Algorithm"] == ["AWS4-HMAC-SHA256"]
    assert "/fr-par/s3/aws4_request" in query["X-Amz-Credential"][0]
    assert query["X-Amz-Expires"] == ["86400"]
