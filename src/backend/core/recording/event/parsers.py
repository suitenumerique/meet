"""Meet storage event parser classes."""

import logging
import mimetypes
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Optional, Protocol

from django.conf import settings
from django.utils.module_loading import import_string

from core.enums import FILE_EXT_REGEX, UUID_REGEX

from .exceptions import (
    InvalidBucketError,
    InvalidFilepathError,
    InvalidFileTypeError,
    ParsingEventDataError,
)

# Additional MIME type mapping
mimetypes.add_type("audio/ogg", ".ogg")

logger = logging.getLogger(__name__)


@dataclass
class StorageEvent:
    """Represents a storage event with relevant metadata.
    Attributes:
        filepath: Identifier for the affected recording
        filetype: Type of storage event
        bucket_name: When the event occurred
        metadata: Additional event data
    """

    filepath: str
    filetype: str
    bucket_name: str
    metadata: Optional[Dict[str, Any]]

    def __post_init__(self):
        if self.filepath is None:
            raise TypeError("filepath cannot be None")
        if self.filetype is None:
            raise TypeError("filetype cannot be None")
        if self.bucket_name is None:
            raise TypeError("bucket_name cannot be None")


class EventParser(Protocol):
    """Interface for parsing storage events."""

    def __init__(self, bucket_name, allowed_filetypes=None):
        """Initialize parser with bucket name and optional allowed filetypes."""

    def parse(self, data: Dict) -> StorageEvent:
        """Extract storage event data from raw dictionary input."""

    def validate(self, data: StorageEvent) -> None:
        """Verify storage event data meets all requirements."""

    def get_recording_id(self, data: Dict) -> str:
        """Extract recording ID from event dictionary."""


@lru_cache(maxsize=1)
def get_parser() -> EventParser:
    """Return cached instance of configured event parser.
    Uses function memoization instead of a factory class since the only
    varying parameter is the parser class from settings. A factory class
    would add unnecessary complexity when a cached function provides the
    same singleton behavior with simpler code.
    """

    event_parser_cls = import_string(settings.RECORDING_EVENT_PARSER_CLASS)
    return event_parser_cls(bucket_name=settings.AWS_STORAGE_BUCKET_NAME)


class BaseParser:
    """Base class for handling parsing and validation of S3-compatible storage events."""

    def __init__(self, bucket_name: str, allowed_filetypes=None):
        """Initialize parser with target bucket name and accepted filetypes."""

        if not bucket_name:
            raise ValueError("Bucket name cannot be None or empty")

        self._bucket_name = bucket_name
        self._allowed_filetypes = allowed_filetypes or {"audio/ogg", "video/mp4"}

        # pylint: disable=line-too-long
        self._filepath_regex = re.compile(
            rf"(?P<url_encoded_folder_path>(?:[^%]+%2F)+)?{settings.RECORDING_OUTPUT_FOLDER}%2F(?P<recording_id>{UUID_REGEX})\.(?P<extension>{FILE_EXT_REGEX})"
        )

    def validate(self, event_data: StorageEvent) -> str:
        """Verify StorageEvent matches bucket, filetype and filepath requirements."""

        if event_data.bucket_name != self._bucket_name:
            raise InvalidBucketError(
                f"Invalid bucket: expected {self._bucket_name}, got {event_data.bucket_name}"
            )

        if event_data.filetype not in self._allowed_filetypes:
            raise InvalidFileTypeError(
                f"Invalid file type, expected {self._allowed_filetypes},"
                f"got '{event_data.filetype}'"
            )

        match = self._filepath_regex.match(event_data.filepath)
        if not match:
            raise InvalidFilepathError(
                f"Invalid filepath structure: {event_data.filepath}"
            )

        recording_id = match.group("recording_id")
        return recording_id

    def get_recording_id(self, data):
        """Extract recording ID from S3 event through parsing and validation."""

        event_data = self.parse(data)
        return self.validate(event_data)

    def parse(self, data: Dict) -> StorageEvent:
        """To be implemented by subclasses."""
        raise NotImplementedError("Subclasses must implement parse()")


class MinioParser(BaseParser):
    """Minio specific event parsing."""

    def parse(self, data: Dict) -> StorageEvent:
        if not data:
            raise ParsingEventDataError("Received empty data.")
        try:
            record = data["Records"][0]
            s3 = record["s3"]
            return StorageEvent(
                filepath=s3["object"]["key"],
                filetype=s3["object"].get("contentType"),  # Minio-specific field
                bucket_name=s3["bucket"]["name"],
                metadata=None,
            )
        except (KeyError, IndexError) as e:
            raise ParsingEventDataError(f"Malformed Minio event: {e}") from e
        except TypeError as e:
            raise ParsingEventDataError(f"Missing essential data fields: {e}") from e


class S3Parser(BaseParser):
    """AWS S3 specific event parsing."""

    def parse(self, data: Dict) -> StorageEvent:
        if not data:
            raise ParsingEventDataError("Received empty data.")
        try:
            # AWS S3 structure can slightly differ from Minio implementation
            record = data["Records"][0]
            s3 = record["s3"]
            filepath = s3["object"]["key"]
            if not filepath:
                raise ParsingEventDataError(f"Missing object key name")
            filetype, _ = mimetypes.guess_type(filepath)
            return StorageEvent(
                filepath=filepath,
                filetype=filetype,
                bucket_name=s3["bucket"]["name"],
                metadata=None,
            )
        except (KeyError, IndexError) as e:
            raise ParsingEventDataError(f"Malformed S3 event: {e}") from e
        except TypeError as e:
            raise ParsingEventDataError(f"Missing essential data fields: {e}") from e
