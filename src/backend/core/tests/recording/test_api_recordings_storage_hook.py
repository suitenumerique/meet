"""
Test recordings API endpoints in the Meet core app: save recording.
"""

# pylint: disable=redefined-outer-name,unused-argument

import uuid
from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...factories import RecordingFactory
from ...models import Recording, RecordingStatusChoices
from ...recording.event.exceptions import (
    InvalidBucketError,
    InvalidFileTypeError,
    ParsingEventDataError,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def recording_settings(settings):
    """Configure recording-related and storage event Django settings."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "testAuthToken"
    settings.RECORDING_STORAGE_EVENT_ENABLE = True
    return settings


@pytest.fixture
def mock_get_parser():
    """Mock 'get_parser' factory function."""
    with mock.patch("core.api.viewsets.get_parser") as mock_parser:
        yield mock_parser


def test_save_recording_anonymous(settings, client):
    """Anonymous users should not be allowed to save room recordings."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "testAuthToken"

    RecordingFactory(status="active")

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
    )

    assert response.status_code == 401
    assert Recording.objects.count() == 1


def test_save_recording_wrong_bearer(settings, client):
    """Requests with incorrect bearer token should be rejected when auth is required."""

    settings.RECORDING_STORAGE_EVENT_TOKEN = "testAuthToken"

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer wrongAuthToken",
    )

    assert response.status_code == 401


def test_save_recording_permission_needed(settings, client):
    """Recordings should not be saved when feature is disabled."""

    settings.RECORDING_STORAGE_EVENT_TOKEN = "testAuthToken"
    settings.RECORDING_STORAGE_EVENT_ENABLE = False

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 403


def test_save_recording_parsing_error(recording_settings, mock_get_parser, client):
    """Test handling of parsing errors in recording event data."""
    mock_parser = mock.Mock()
    mock_parser.get_recording_id.side_effect = ParsingEventDataError("Error message")
    mock_get_parser.return_value = mock_parser

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Invalid request data: Error message"}


def test_save_recording_bucket_error(recording_settings, mock_get_parser, client):
    """Test handling of invalid storage bucket errors in recording event data."""

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.side_effect = InvalidBucketError("Error message")
    mock_get_parser.return_value = mock_parser

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Invalid bucket specified"}


def test_save_recording_filetype_error(recording_settings, mock_get_parser):
    """Test handling of unsupported file types in recording event data."""

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.side_effect = InvalidFileTypeError(
        "unsupported '.json'"
    )
    mock_get_parser.return_value = mock_parser

    client = APIClient()

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Ignore this file type, unsupported '.json'"}


def test_save_recording_unknown_recording(recording_settings, mock_get_parser, client):
    """Test handling of events for non-existent recordings."""

    RecordingFactory(status="active")

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.return_value = uuid.uuid4()
    mock_get_parser.return_value = mock_parser

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "No recording found for this event."}


@pytest.mark.parametrize(
    "status", ["failed_to_start", "aborted", "failed_to_stop", "saved", "initiated"]
)
def test_save_recording_non_savable_recording(
    recording_settings, mock_get_parser, client, status
):
    """Test that recordings in non-savable states cannot be saved."""

    recording = RecordingFactory(status=status)

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.return_value = recording.id
    mock_get_parser.return_value = mock_parser

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": f"Recording with ID {recording.id} cannot be saved because it is either,"
        " in an error state or has already been saved."
    }


@pytest.mark.parametrize("status", ["active", "stopped"])
def test_save_recording_success(recording_settings, mock_get_parser, client, status):
    """Test successful saving of recordings in valid states."""

    recording = RecordingFactory(status=status)

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.return_value = recording.id
    mock_get_parser.return_value = mock_parser

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Event processed."}

    recording.refresh_from_db()
    assert recording.status == RecordingStatusChoices.SAVED
