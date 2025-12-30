"""File service to encapsulate files' manipulations."""

import os
import tempfile
from contextlib import contextmanager
from pathlib import Path

import mutagen
from minio import Minio

from summary.core.config import get_settings

settings = get_settings()


class FileService:
    """Service for downloading and preparing files from MinIO storage."""

    def __init__(self, logger):
        """Initialize FileService with MinIO client and configuration."""
        self._logger = logger

        self._minio_client = Minio(
            settings.aws_s3_endpoint_url,
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
        self._logger.info("Download recording | object_key: %s", remote_object_key)

        if not remote_object_key:
            self._logger.warning("Invalid object_key '%s'", remote_object_key)
            raise ValueError("Invalid object_key")

        extension = Path(remote_object_key).suffix.lower()

        if extension not in self._allowed_extensions:
            self._logger.warning("Invalid file extension '%s'", extension)
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

                self._logger.info("Recording successfully downloaded")
                self._logger.debug("Recording local file path: %s", local_path)

                return local_path

        finally:
            if response:
                response.close()

    def _validate_duration(self, local_path: Path) -> float:
        """Validate audio file duration against configured maximum."""
        file_metadata = mutagen.File(local_path).info
        duration = file_metadata.length

        self._logger.info(
            "Recording file duration: %.2f seconds",
            duration,
        )

        if self._max_duration is not None and duration > self._max_duration:
            error_msg = "Recording too long. Limit is %.2fs seconds" % (
                self._max_duration,
            )
            self._logger.error(error_msg)
            raise ValueError(error_msg)

        return duration

    @contextmanager
    def prepare_audio_file(self, remote_object_key: str):
        """Download and prepare audio file for processing.

        Downloads file from MinIO, validates duration, and yields an open
        file handle with metadata. Automatically cleans up temporary files
        when the context exits.
        """
        downloaded_path = None
        file_handle = None

        try:
            downloaded_path = self._download_from_minio(remote_object_key)
            duration = self._validate_duration(downloaded_path)

            extension = downloaded_path.suffix.lower()
            metadata = {"duration": duration, "extension": extension}

            file_handle = open(downloaded_path, "rb")
            yield file_handle, metadata

        finally:
            if file_handle:
                file_handle.close()

            for path in [downloaded_path]:
                if path is None or not os.path.exists(path):
                    continue

                try:
                    os.remove(path)
                    self._logger.debug("Temporary file removed: %s", path)
                except OSError as e:
                    self._logger.warning(
                        "Failed to remove temporary file %s: %s", path, e
                    )
