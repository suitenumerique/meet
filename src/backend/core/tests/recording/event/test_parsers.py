"""
Test event parsers.
"""

# pylint: disable=protected-access,redefined-outer-name,unused-argument

from unittest import mock

from django.conf import settings

import pytest

from core.recording.event.exceptions import (
    InvalidBucketError,
    InvalidFilepathError,
    InvalidFileTypeError,
    ParsingEventDataError,
)
from core.recording.event.parsers import (
    MinioParser,
    StorageEvent,
    get_parser,
)


@pytest.fixture
def valid_minio_event():
    """Mock a valid Minio event."""
    return {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": "test-bucket"},
                    "object": {
                        "key": "recording%2F46d1a121-2426-484d-8fb3-09b5d886f7a8.ogg",
                        "contentType": "audio/ogg",
                    },
                }
            }
        ]
    }


@pytest.fixture
def minio_parser():
    """Mock a Minio parser."""
    return MinioParser(bucket_name="test-bucket")


def test_parse_valid_event(minio_parser, valid_minio_event):
    """Test parsing a valid Minio event."""
    event = minio_parser.parse(valid_minio_event)
    assert isinstance(event, StorageEvent)
    assert event.filepath == "recording%2F46d1a121-2426-484d-8fb3-09b5d886f7a8.ogg"
    assert event.filetype == "audio/ogg"
    assert event.bucket_name == "test-bucket"
    assert event.metadata is None


def test_parse_empty_data(minio_parser):
    """Test parsing empty event data raises error."""
    with pytest.raises(ParsingEventDataError, match="Received empty data."):
        minio_parser.parse({})


def test_parse_missing_keys(minio_parser):
    """Test parsing event with missing key."""

    invalid_minio_event = {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": None},
                    # Missing 'object' key
                }
            }
        ]
    }

    with pytest.raises(ParsingEventDataError, match="Missing or malformed key"):
        minio_parser.parse(invalid_minio_event)


def test_parse_none_key(minio_parser):
    """Test parsing event with None field."""

    invalid_minio_event = {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": "test-bucket"},
                    "object": {
                        "key": "recording%2F46d1a121-2426-484d-8fb3-09b5d886f7a8.ogg",
                        "contentType": None,  # 'contentType' should not be None
                    },
                }
            }
        ]
    }

    with pytest.raises(ParsingEventDataError, match="Missing essential data fields"):
        minio_parser.parse(invalid_minio_event)


def test_validate_invalid_bucket(minio_parser):
    """Test validation with wrong bucket name."""
    event = StorageEvent(
        filepath="recording%2F46d1a121-2426-484d-8fb3-09b5d886f7a8.ogg",
        filetype="audio/ogg",
        bucket_name="wrong-bucket",
        metadata=None,
    )
    with pytest.raises(InvalidBucketError):
        minio_parser.validate(event)


def test_validate_invalid_filetype(minio_parser):
    """Test validation with unsupported file type."""
    event = StorageEvent(
        filepath="recording%2F46d1a121-2426-484d-8fb3-09b5d886f7a8.txt",
        filetype="text/plain",  # Not included in the default allowed filetypes
        bucket_name="test-bucket",
        metadata=None,
    )
    with pytest.raises(InvalidFileTypeError):
        minio_parser.validate(event)


@pytest.mark.parametrize(
    "invalid_filepath",
    [
        "invalid_filepath",  # totally invalid string
        "recording/46d1a121-2426-484d-8fb3-09b5d886f7a8.ogg",
        "recording/46d1a121-2426-484d-8fb3-09b5d886f7a8",  # missing extension
        "46d1a121-2426-484d-8fb3-09b5d886f7a8",  # missing url_encoded_folder_path and extension
        "",  # empty string
        "recording%2F46d1a1212426484d8fb309b5d886f7a8.ogg",
    ],
)
def test_validate_invalid_filepath(invalid_filepath, minio_parser):
    """Test validation with malformed filepath."""
    event = StorageEvent(
        filepath=invalid_filepath,
        filetype="audio/ogg",
        bucket_name="test-bucket",
        metadata=None,
    )
    with pytest.raises(InvalidFilepathError):
        minio_parser.validate(event)


def test_validate_valid_event(minio_parser):
    """Test validation with valid event data."""
    event = StorageEvent(
        filepath="recording%2F46d1a121-2426-484d-8fb3-09b5d886f7a8.ogg",
        filetype="audio/ogg",
        bucket_name="test-bucket",
        metadata=None,
    )
    recording_id = minio_parser.validate(event)
    assert recording_id == "46d1a121-2426-484d-8fb3-09b5d886f7a8"


def test_get_recording_id_success(minio_parser, valid_minio_event):
    """Test successful extraction of recording ID."""
    recording_id = minio_parser.get_recording_id(valid_minio_event)
    assert recording_id == "46d1a121-2426-484d-8fb3-09b5d886f7a8"


def test_validate_filepath_with_folder(minio_parser):
    """Test validation of filepath with folder structure."""
    event = StorageEvent(
        filepath="parent_folder%2Ffolder%2F46d1a121-2426-484d-8fb3-09b5d886f7a8.ogg",
        filetype="audio/ogg",
        bucket_name="test-bucket",
        metadata=None,
    )
    recording_id = minio_parser.validate(event)
    assert recording_id == "46d1a121-2426-484d-8fb3-09b5d886f7a8"


def test_parse_with_video_type(minio_parser):
    """Test parsing event with video file type."""
    video_event = {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": "test-bucket"},
                    "object": {
                        "key": "46d1a121-2426-484d-8fb3-09b5d886f7a8.mp4",
                        "contentType": "video/mp4",
                    },
                }
            }
        ]
    }
    event = minio_parser.parse(video_event)
    assert event.filetype == "video/mp4"
    assert event.filepath.endswith(".mp4")


def test_empty_allowed_filetypes():
    """Test MinioParser with empty allowed_filetypes."""
    empty_types = set()
    parser = MinioParser(bucket_name="test-bucket", allowed_filetypes=empty_types)
    assert parser._allowed_filetypes == {"audio/ogg", "video/mp4"}


def test_custom_allowed_filetypes():
    """Test MinioParser with empty allowed_filetypes."""
    custom_types = {"audio/mp3", "video/mov"}
    parser = MinioParser(bucket_name="test-bucket", allowed_filetypes=custom_types)
    assert parser._allowed_filetypes == {"audio/mp3", "video/mov"}


def test_validate_custom_filetypes():
    """Test validation of filepath with folder structure."""

    parser = MinioParser(bucket_name="test-bucket", allowed_filetypes={"audio/mp3"})

    event = StorageEvent(
        filepath="parent_folder%2Ffolder%2F46d1a121-2426-484d-8fb3-09b5d886f7a8.ogg",
        filetype="audio/mp3",
        bucket_name="test-bucket",
        metadata=None,
    )
    parser.validate(event)


def test_constructor_none_bucket():
    """Test MinioParser constructor with None bucket name."""
    with pytest.raises(ValueError, match="Bucket name cannot be None or empty"):
        MinioParser(bucket_name=None)


def test_constructor_empty_bucket():
    """Test MinioParser constructor with empty bucket name."""
    with pytest.raises(ValueError, match="Bucket name cannot be None or empty"):
        MinioParser(bucket_name="")


@pytest.fixture
def clear_lru_cache():
    """Fixture to clear the LRU cache between tests."""
    get_parser.cache_clear()
    yield
    get_parser.cache_clear()


def test_returns_correct_instance(clear_lru_cache):
    """Test if get_parser returns the correct parser instance."""
    settings.AWS_STORAGE_BUCKET_NAME = "test-bucket"
    parser = get_parser()
    assert isinstance(parser, MinioParser)
    assert parser._bucket_name == "test-bucket"


def test_caching_behavior(clear_lru_cache):
    """Test if the function properly caches the parser instance."""
    settings.AWS_STORAGE_BUCKET_NAME = "test-bucket"
    parser1 = get_parser()
    parser2 = get_parser()
    assert parser1 is parser2  # Check object identity


def test_different_settings_new_instance():
    """Test if changing settings creates a new instance."""
    settings.AWS_STORAGE_BUCKET_NAME = "different-bucket"
    parser = get_parser()
    assert parser._bucket_name == "different-bucket"


def test_import_error_handling(clear_lru_cache):
    """Test handling of import errors for invalid parser class."""
    settings.RECORDING_EVENT_PARSER_CLASS = "invalid.parser.path"
    with pytest.raises(ImportError):
        get_parser()


@mock.patch("core.recording.event.parsers.import_string")
def test_parser_instantiation_called_once(mock_import_string, clear_lru_cache):
    """Test that parser class is instantiated only once due to caching."""
    mock_parser_cls = type(
        "MockParser",
        (),
        {
            "__init__": lambda self, bucket_name: setattr(
                self, "_bucket_name", bucket_name
            )
        },
    )
    mock_import_string.return_value = mock_parser_cls

    # First call
    parser1 = get_parser()
    # Second call
    parser2 = get_parser()

    # Verify import_string was called only once
    mock_import_string.assert_called_once_with(settings.RECORDING_EVENT_PARSER_CLASS)
    assert parser1 is parser2


def test_cache_clear_behavior(clear_lru_cache, settings):
    """Test that cache clearing creates new instance."""

    settings.RECORDING_EVENT_PARSER_CLASS = "core.recording.event.parsers.MinioParser"

    parser1 = get_parser()
    get_parser.cache_clear()
    parser2 = get_parser()

    assert parser1 is not parser2  # Should be different instances after cache clear
