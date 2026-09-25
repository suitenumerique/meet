"""File service to encapsulate files' manipulations."""

import json
import logging
import os
import subprocess
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import timedelta
from functools import cached_property
from pathlib import Path
from urllib.parse import urlparse

import boto3
import requests
from botocore.config import Config

from summary.core.config import get_settings
from summary.core.shared_models import WhisperXResponse

settings = get_settings()

logger = logging.getLogger(__name__)

DEFAULT_S3_REGION_NAME = "us-east-1"


class TranscribeError(ValueError):
    """Base class for transcribe-related errors."""

    error_code: str = "unknown_error"


class MediaDurationTooLongError(TranscribeError):
    """Raised when the duration of a media file exceeds the allowed limit."""

    error_code = "media_duration_too_long"


class NoAudioInFileError(TranscribeError):
    """Raised when a media file does not contain any audio."""

    error_code = "no_audio_in_file"


class CorruptedAudioFile(TranscribeError):
    """Raised when a media file does not contain any audio."""

    error_code = "corrupted_audio_file"


def _get_duration_from_packets(local_path: Path) -> float:
    """Estimate duration from audio packet timestamps."""
    # Run ffprobe to inspect the first audio stream in the file.
    # ffprobe is part of FFmpeg and can output media metadata as JSON.
    #
    # ruff: noqa: S607 Hard to know the ffprobe path, it depends on the deployment
    result = subprocess.run(
        [
            "ffprobe",
            # Suppress normal ffprobe logging output.
            "-v",
            "quiet",
            # Ask ffprobe to return JSON.
            "-print_format",
            "json",
            # Select only the first audio stream.
            "-select_streams",
            "a:0",
            # Include packet-level information in the output.
            "-show_packets",
            # Only include each packet's start timestamp and duration.
            "-show_entries",
            "packet=pts_time,duration_time",
            # Read only the last ~10 packets 99999999 is to go to the end of the file
            "-read_intervals",
            "99999999%+#10",
            # Skip non-reference frames for speed
            "-skip_frame",
            "noref",
            local_path,
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,  # Decode stdout/stderr as strings instead of bytes.
    )

    data = json.loads(result.stdout)
    # Build a list containing the end time of each audio packet.
    #
    # For each packet:
    #   end time = packet start time + packet duration
    #
    # pts_time is the packet presentation timestamp, meaning when that packet
    # starts during playback.
    #
    # duration_time may be missing, so it defaults to 0.
    packet_ends = [
        float(packet["pts_time"]) + float(packet.get("duration_time", 0))
        for packet in data.get("packets", [])
        if "pts_time" in packet
    ]

    # If no usable packets were found, the duration cannot be estimated.
    if not packet_ends:
        raise ValueError("Unable to determine recording duration.")

    # The recording duration is estimated as the latest packet end time.
    return max(packet_ends)


def get_media_duration_seconds(local_path: Path) -> float:
    """Get media (audio or video) file duration in seconds."""
    # ruff: noqa: S607 Hard to know the ffprobe path, it depends on the deployment
    result = subprocess.run(
        [
            "ffprobe",
            # Suppress normal ffprobe logging output.
            "-v",
            "quiet",
            # Ask ffprobe to return JSON.
            "-print_format",
            "json",
            "-show_format",
            local_path,
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    data = json.loads(result.stdout)
    duration_value = data.get("format", {}).get("duration")

    if duration_value not in (None, "N/A"):
        return float(duration_value)

    return _get_duration_from_packets(local_path)


@dataclass(frozen=True)
class MediaInfo:
    """Object containing information about the media file."""

    path: Path
    has_audio: bool
    has_video: bool
    audio_duration_seconds: float | None
    audio_codec_name: str | None
    has_bad_stream: bool = False


def get_media_info(local_path: Path) -> MediaInfo:
    """Determines if a media file contains an audio and / or a video stream.

    This function checks if the given media file contains at least one
    audio / video stream. It utilizes ffmpeg to analyze the media and parse
    its metadata to detect the presence of audio / video content.
    If appropriate, it also retrieves the codec name for the audio stream
    and its duration.
    """
    # ruff: noqa: S607 Hard to know the ffprobe path, it depends on the deployment
    # ruff: noqa: S603 Input can be trusted
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,codec_name",
            "-print_format",
            "json",
            str(local_path),
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    data = json.loads(result.stdout)

    streams = data.get("streams", [])
    has_audio = any(el.get("codec_type") == "audio" for el in streams)
    has_video = any(el.get("codec_type") == "video" for el in streams)
    has_bad_stream = any(el.get("codec_type", None) is None for el in streams)
    audio_codec_name = next(
        (
            stream.get("codec_name")
            for stream in streams
            if stream.get("codec_type") == "audio"
        ),
        None,
    )
    audio_duration_seconds = None
    if has_audio:
        audio_duration_seconds = get_media_duration_seconds(local_path)
    return MediaInfo(
        path=local_path,
        has_audio=has_audio,
        has_video=has_video,
        audio_duration_seconds=audio_duration_seconds,
        audio_codec_name=audio_codec_name,
        has_bad_stream=has_bad_stream,
    )


def extract_audio_from_media(media_info: MediaInfo) -> Path:
    """Extracts the audio track from a video file and saves it as a separate audio file.

    Based on the provided audio codec,
    it determines an appropriate audio file extension.
    It then runs
    `ffmpeg` to extract the audio track without re-encoding it, ensuring quality is
    preserved and speed.

    Raises:
        CalledProcessError: Raised if the `ffmpeg` command execution fails.
    """
    if media_info.audio_codec_name is None:
        raise ValueError("Media file must have codec name must be provided")

    # .mka can contain a bunch of audio codecs, using it as a default
    # to avoid potential issues with the ffmpeg copy later on
    suffix = settings.codec_to_extension.get(media_info.audio_codec_name, ".mka")

    with tempfile.NamedTemporaryFile(
        suffix=suffix,
        delete=False,
        prefix="audio_extract_",
    ) as tmp:
        output_path = Path(tmp.name)

    extract_command = [
        "ffmpeg",
        "-v",
        "quiet",
        "-i",
        str(media_info.path),
        "-vn",
        "-acodec",
        "copy",
        "-y",
        str(output_path),
    ]

    try:
        subprocess.run(extract_command, check=True)
    except BaseException as e:
        if isinstance(e, FileNotFoundError):
            logger.error("ffmpeg not found. Please install ffmpeg.")
        elif isinstance(e, subprocess.CalledProcessError):
            logger.error("Audio extraction failed: %s", e.stderr.decode())
        else:
            logger.error("Unexpected error during audio extraction: %s", e)

        if output_path.exists():
            os.remove(output_path)
        raise RuntimeError("Failed to extract audio from file") from e

    return output_path


class FileServiceException(Exception):
    """Base exception for file service operations."""

    pass


def _build_s3_client(region_name: str):
    """Build an S3 client for the configured endpoint, signing for a region.

    The endpoint may be given with or without a scheme: the scheme always
    follows `aws_s3_secure_access`.
    """
    endpoint = (
        settings.aws_s3_endpoint_url.removeprefix("https://")
        .removeprefix("http://")
        .rstrip("/")
    )
    scheme = "https" if settings.aws_s3_secure_access else "http"

    return boto3.client(
        "s3",
        endpoint_url=f"{scheme}://{endpoint}",
        aws_access_key_id=settings.aws_s3_access_key_id,
        aws_secret_access_key=settings.aws_s3_secret_access_key.get_secret_value(),
        region_name=region_name,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


class FileService:
    """Service for downloading and preparing files from S3 storage."""

    def __init__(self):
        """Initialize FileService with its configuration."""
        self._bucket_name = settings.aws_storage_bucket_name
        self._stream_chunk_size = 32 * 1024

        self._max_duration_seconds = settings.recording_max_duration

    @cached_property
    def _s3_client(self):
        """S3 client, created on first use.

        When no region is configured, it is looked up from the bucket, so
        that requests are signed for the region the provider expects.
        """
        region_name = settings.aws_s3_region_name
        if not region_name:
            lookup_client = _build_s3_client(DEFAULT_S3_REGION_NAME)
            location = lookup_client.get_bucket_location(Bucket=self._bucket_name)
            region_name = location.get("LocationConstraint") or DEFAULT_S3_REGION_NAME

        return _build_s3_client(region_name)

    def _download_from_cloud_storage_url(self, cloud_storage_url: str) -> Path:
        """Download file from a cloud storage URL to local temporary file."""
        logger.info(
            "Download recording from URL | cloud_storage_url: %s",
            cloud_storage_url,
        )

        if not cloud_storage_url:
            logger.warning("Invalid cloud_storage_url '%s'", cloud_storage_url)
            raise ValueError("Invalid cloud_storage_url")

        extension = Path(urlparse(cloud_storage_url).path).suffix.lower()

        try:
            with requests.get(
                cloud_storage_url,
                stream=True,
                timeout=(10, 300),
                # verify=False,
            ) as response:
                response.raise_for_status()

                with tempfile.NamedTemporaryFile(
                    suffix=extension,
                    delete=False,
                    prefix="cloud_storage_download_",
                ) as tmp:
                    for chunk in response.iter_content(
                        chunk_size=self._stream_chunk_size
                    ):
                        if chunk:
                            tmp.write(chunk)

                    tmp.flush()
                    local_path = Path(tmp.name)

                    logger.info(
                        "Recording successfully downloaded from cloud_storage_url"
                    )
                    logger.debug("Recording local file path: %s", local_path)
                    return local_path

        except requests.RequestException as e:
            raise FileServiceException(
                "Unexpected error while downloading object from cloud_storage_url."
            ) from e

    def _validate_duration(self, duration_seconds: float) -> None:
        """Validate audio file duration against configured maximum."""
        logger.info(
            "Recording file duration: %.2f seconds",
            duration_seconds,
        )

        if (
            self._max_duration_seconds is not None
            and duration_seconds > self._max_duration_seconds
        ):
            error_msg = "Recording too long. Limit is %.2fs seconds" % (
                self._max_duration_seconds,
            )
            logger.error(error_msg)
            raise MediaDurationTooLongError(error_msg)

    def read_cloud_storage_json(self, cloud_storage_url: str) -> dict:
        """Read and parse a JSON file from a url."""
        logger.info("Reading JSON: %s", cloud_storage_url)
        res = requests.get(cloud_storage_url, timeout=(10, 100))
        res.raise_for_status()
        return res.json()

    @contextmanager
    def prepare_audio_file(
        self,
        cloud_storage_url: str,
    ):
        """Download and prepare audio file for processing.

        Downloads file from S3 or an external cloud URL, validates duration,
        and yields an open file handle with metadata. Automatically cleans up
        temporary files when the context exits.
        """
        downloaded_path: Path | None = None
        processed_path: Path | None = None
        file_handle = None

        try:
            downloaded_path = self._download_from_cloud_storage_url(cloud_storage_url)

            media_info = get_media_info(downloaded_path)

            if not media_info.has_audio:
                raise NoAudioInFileError("Media file does not contain audio")
            self._validate_duration(media_info.audio_duration_seconds)

            if media_info.has_video:
                logger.info("Video file detected, extracting audio...")
                processed_path = extract_audio_from_media(media_info)
            # Bad streams may cause transcription issues on WhisperX,
            # So we extract the audio properly
            elif media_info.has_bad_stream:
                logger.info("Bad stream detected, extracting audio...")
                processed_path = extract_audio_from_media(media_info)
            else:
                processed_path = downloaded_path

            metadata = {"duration": media_info.audio_duration_seconds}

            file_handle = open(processed_path, "rb")
            yield file_handle, metadata

        finally:
            if file_handle:
                file_handle.close()

            for path in [downloaded_path, processed_path]:
                if path is None or not os.path.exists(path):
                    continue

                try:
                    os.remove(path)
                    logger.debug("Temporary file removed: %s", path)
                except OSError as e:
                    logger.warning("Failed to remove temporary file %s: %s", path, e)

    def store_transcript(self, *, transcript: WhisperXResponse, job_id: str) -> None:
        """Store transcript in S3."""
        logger.info("Storing transcript for job id %s", job_id)
        transcript_path = f"{settings.aws_transcript_path}/{job_id}.json"
        logger.debug("Transcript path: %s", transcript_path)
        data = transcript.model_dump_json().encode()
        self._s3_client.put_object(
            Bucket=self._bucket_name, Key=transcript_path, Body=data
        )
        logger.info("Transcript stored successfully for job id %s", job_id)

    def get_transcript_signed_url(self, job_id: str) -> str:
        """Get signed URL for transcript file."""
        transcript_path = f"{settings.aws_transcript_path}/{job_id}.json"
        logger.debug("Transcript path: %s", transcript_path)
        return self._s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket_name, "Key": transcript_path},
            ExpiresIn=int(timedelta(hours=24).total_seconds()),
        )

    def store_summary(self, *, summary: str, job_id: str) -> None:
        """Store summary in S3."""
        logger.info("Storing summary for job id %s", job_id)
        summary_path = f"{settings.aws_summary_path}/{job_id}.txt"
        logger.debug("Summary path: %s", summary_path)
        data = summary.encode()
        self._s3_client.put_object(
            Bucket=self._bucket_name, Key=summary_path, Body=data
        )
        logger.info("Summary stored successfully for job id %s", job_id)

    def get_summary_signed_url(self, job_id: str) -> str:
        """Get signed URL for summary file."""
        summary_path = f"{settings.aws_summary_path}/{job_id}.txt"
        logger.debug("Summary path: %s", summary_path)
        return self._s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket_name, "Key": summary_path},
            ExpiresIn=int(timedelta(hours=24).total_seconds()),
        )
