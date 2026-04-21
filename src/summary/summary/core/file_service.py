"""File service to encapsulate files' manipulations."""

import io
import json
import logging
import os
import subprocess
import tempfile
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

import requests
from minio import Minio
from minio.error import MinioException, S3Error

from summary.core.config import get_settings
from summary.core.shared_models import WhisperXResponse

settings = get_settings()

logger = logging.getLogger(__name__)


class FileServiceException(Exception):
    """Base exception for file service operations."""

    pass


class FileService:
    """Service for downloading and preparing files from MinIO storage."""

    def __init__(self):
        """Initialize FileService with MinIO client and configuration."""
        endpoint = (
            settings.aws_s3_endpoint_url.removeprefix("https://")
            .removeprefix("http://")
            .rstrip("/")
        )

        self._minio_client = Minio(
            endpoint,
            access_key=settings.aws_s3_access_key_id,
            secret_key=settings.aws_s3_secret_access_key.get_secret_value(),
            secure=settings.aws_s3_secure_access,
        )

        self._bucket_name = settings.aws_storage_bucket_name
        self._stream_chunk_size = 32 * 1024

        self._allowed_extensions = settings.recording_allowed_extensions
        self._max_duration = settings.recording_max_duration

    def _download_from_minio(self, remote_object_key) -> Path:
        """Download file from MinIO to local temporary file.

        The file is downloaded to a temporary location for local manipulation
        such as validation, conversion, or processing before being used.
        """
        logger.info("Download recording | object_key: %s", remote_object_key)

        if not remote_object_key:
            logger.warning("Invalid object_key '%s'", remote_object_key)
            raise ValueError("Invalid object_key")

        extension = Path(remote_object_key).suffix.lower()

        if extension not in self._allowed_extensions:
            logger.warning("Invalid file extension '%s'", extension)
            raise ValueError(f"Invalid file extension '{extension}'")

        response = None

        try:
            response = self._minio_client.get_object(
                self._bucket_name, remote_object_key
            )

            with tempfile.NamedTemporaryFile(
                suffix=extension, delete=False, prefix="minio_download_"
            ) as tmp:
                for chunk in response.stream(self._stream_chunk_size):
                    tmp.write(chunk)

                tmp.flush()
                local_path = Path(tmp.name)

                logger.info("Recording successfully downloaded")
                logger.debug("Recording local file path: %s", local_path)

                return local_path

        except (MinioException, S3Error) as e:
            raise FileServiceException(
                "Unexpected error while downloading object."
            ) from e

        finally:
            if response:
                response.close()

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
        if extension not in self._allowed_extensions:
            logger.warning(
                "Invalid file extension '%s' from cloud_storage_url", extension
            )
            raise ValueError(f"Invalid file extension '{extension}'")

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

    def _validate_duration(self, local_path: Path) -> float:
        """Validate audio file duration against configured maximum."""
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
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
        duration = float(data["format"]["duration"])

        logger.info(
            "Recording file duration: %.2f seconds",
            duration,
        )

        if self._max_duration is not None and duration > self._max_duration:
            error_msg = "Recording too long. Limit is %.2fs seconds" % (
                self._max_duration,
            )
            logger.error(error_msg)
            raise ValueError(error_msg)

        return duration

    def _extract_audio_from_video(self, video_path: Path) -> Path:
        """Extract audio from video file (e.g., MP4) and save as audio file."""
        logger.info("Extracting audio from video file: %s", video_path)

        with tempfile.NamedTemporaryFile(
            suffix=".m4a", delete=False, prefix="audio_extract_"
        ) as tmp:
            output_path = Path(tmp.name)

        try:
            command = [
                "ffmpeg",
                "-i",
                str(video_path),
                "-vn",  # No video
                "-acodec",
                "copy",
                "-y",  # Overwrite output file if exists
                str(output_path),
            ]

            # ruff: noqa: S603
            subprocess.run(
                command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
            )

            logger.info("Audio successfully extracted to: %s", output_path)
            return output_path

        except FileNotFoundError as e:
            logger.error("ffmpeg not found. Please install ffmpeg.")
            if output_path.exists():
                os.remove(output_path)
            raise RuntimeError("ffmpeg is not installed or not in PATH") from e
        except subprocess.CalledProcessError as e:
            logger.error("Audio extraction failed: %s", e.stderr.decode())
            if output_path.exists():
                os.remove(output_path)
            raise RuntimeError("Failed to extract audio.") from e

    @contextmanager
    def prepare_audio_file(
        self,
        remote_object_key: str | None = None,
        cloud_storage_url: str | None = None,
    ):
        """Download and prepare audio file for processing.

        Downloads file from MinIO or an external cloud URL, validates duration,
        and yields an open file handle with metadata. Automatically cleans up
        temporary files when the context exits.
        """
        downloaded_path = None
        processed_path = None
        file_handle = None

        try:
            if bool(remote_object_key) == bool(cloud_storage_url):
                raise ValueError(
                    (
                        "Exactly one of 'remote_object_key' or "
                        "'cloud_storage_url' must be provided."
                    )
                )

            if cloud_storage_url:
                downloaded_path = self._download_from_cloud_storage_url(
                    cloud_storage_url
                )
            else:
                downloaded_path = self._download_from_minio(remote_object_key)

            duration = self._validate_duration(downloaded_path)

            extension = downloaded_path.suffix.lower()

            if extension in settings.recording_video_extensions:
                logger.info("Video file detected, extracting audio...")
                extracted_audio_path = self._extract_audio_from_video(downloaded_path)
                processed_path = extracted_audio_path
            else:
                processed_path = downloaded_path

            metadata = {"duration": duration, "extension": extension}

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
        """Store transcript in MinIO."""
        logger.info("Storing transcript for job id %s", job_id)
        transcript_path = f"{settings.aws_transcript_path}/{job_id}.json"
        logger.debug("Transcript path: %s", transcript_path)
        data = transcript.model_dump_json().encode()
        self._minio_client.put_object(
            self._bucket_name,
            transcript_path,
            io.BytesIO(data),
            length=len(data),
        )
        logger.info("Transcript stored successfully for job id %s", job_id)

    def get_transcript_signed_url(self, job_id: str) -> str:
        """Get signed URL for transcript file."""
        transcript_path = f"{settings.aws_transcript_path}/{job_id}.json"
        logger.debug("Transcript path: %s", transcript_path)
        return self._minio_client.presigned_get_object(
            self._bucket_name, transcript_path, expires=timedelta(hours=24)
        )

    def store_summary(self, *, summary: str, job_id: str) -> None:
        """Store summary in MinIO."""
        logger.info("Storing summary for job id %s", job_id)
        summary_path = f"{settings.aws_summary_path}/{job_id}.txt"
        logger.debug("Summary path: %s", summary_path)
        data = summary.encode()
        self._minio_client.put_object(
            self._bucket_name,
            summary_path,
            io.BytesIO(data),
            length=len(data),
        )
        logger.info("Summary stored successfully for job id %s", job_id)

    def get_summary_signed_url(self, job_id: str) -> str:
        """Get signed URL for summary file."""
        summary_path = f"{settings.aws_summary_path}/{job_id}.txt"
        logger.debug("Summary path: %s", summary_path)
        return self._minio_client.presigned_get_object(
            self._bucket_name, summary_path, expires=timedelta(hours=24)
        )
