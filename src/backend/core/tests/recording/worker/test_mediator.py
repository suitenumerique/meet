"""Test WorkerServiceMediator class."""

# pylint: disable=redefined-outer-name,unused-argument

from unittest.mock import Mock

import pytest

from core.factories import RecordingFactory
from core.models import RecordingStatusChoices
from core.recording.worker.exceptions import (
    RecordingStartError,
    RecordingStopError,
    WorkerConnectionError,
    WorkerRequestError,
    WorkerResponseError,
)
from core.recording.worker.factories import WorkerService
from core.recording.worker.mediator import WorkerServiceMediator

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_worker_service():
    """Fixture for mock worker service"""
    return Mock(spec=WorkerService)


@pytest.fixture
def mediator(mock_worker_service):
    """Fixture for WorkerServiceMediator"""
    return WorkerServiceMediator(mock_worker_service)


def test_start_recording_success(mediator, mock_worker_service):
    """Test successful recording start"""
    # Setup
    worker_id = "test-worker-123"
    mock_worker_service.start.return_value = worker_id

    mock_recording = RecordingFactory(
        status=RecordingStatusChoices.INITIATED, worker_id=None
    )
    mediator.start(mock_recording)

    # Verify worker service call
    expected_room_name = str(mock_recording.room.id)
    mock_worker_service.start.assert_called_once_with(
        expected_room_name, mock_recording.id
    )

    # Verify recording updates
    mock_recording.refresh_from_db()
    assert mock_recording.worker_id == worker_id
    assert mock_recording.status == RecordingStatusChoices.ACTIVE


@pytest.mark.parametrize(
    "error_class", [WorkerRequestError, WorkerConnectionError, WorkerResponseError]
)
def test_mediator_start_recording_worker_errors(
    mediator, mock_worker_service, error_class
):
    """Test handling of various worker errors during start"""
    # Setup
    mock_worker_service.start.side_effect = error_class("Test error")
    mock_recording = RecordingFactory(
        status=RecordingStatusChoices.INITIATED, worker_id=None
    )

    # Execute and verify
    with pytest.raises(RecordingStartError):
        mediator.start(mock_recording)

    # Verify recording updates
    mock_recording.refresh_from_db()
    assert mock_recording.status == RecordingStatusChoices.FAILED_TO_START
    assert mock_recording.worker_id is None


@pytest.mark.parametrize(
    "status",
    [
        RecordingStatusChoices.ACTIVE,
        RecordingStatusChoices.FAILED_TO_START,
        RecordingStatusChoices.FAILED_TO_STOP,
        RecordingStatusChoices.STOPPED,
        RecordingStatusChoices.SAVED,
        RecordingStatusChoices.ABORTED,
    ],
)
def test_mediator_start_recording_from_forbidden_status(
    mediator, mock_worker_service, status
):
    """Test handling of various worker errors during start"""
    # Setup
    mock_recording = RecordingFactory(status=status)

    # Execute and verify
    with pytest.raises(RecordingStartError):
        mediator.start(mock_recording)

    # Verify recording was not updated
    mock_recording.refresh_from_db()
    assert mock_recording.status == status


def test_mediator_stop_recording_success(mediator, mock_worker_service):
    """Test successful recording stop"""
    # Setup
    mock_recording = RecordingFactory(
        status=RecordingStatusChoices.ACTIVE, worker_id="test-worker-123"
    )
    mock_worker_service.stop.return_value = "STOPPED"

    # Execute
    mediator.stop(mock_recording)

    # Verify worker service call
    mock_worker_service.stop.assert_called_once_with(worker_id=mock_recording.worker_id)

    # Verify recording updates
    mock_recording.refresh_from_db()
    assert mock_recording.status == RecordingStatusChoices.STOPPED


def test_mediator_stop_recording_aborted(mediator, mock_worker_service):
    """Test recording stop when worker returns ABORTED"""
    # Setup
    mock_recording = RecordingFactory(
        status=RecordingStatusChoices.ACTIVE, worker_id="test-worker-123"
    )
    mock_worker_service.stop.return_value = "ABORTED"

    # Execute
    mediator.stop(mock_recording)

    # Verify recording updates
    mock_recording.refresh_from_db()
    assert mock_recording.status == RecordingStatusChoices.ABORTED


@pytest.mark.parametrize("error_class", [WorkerConnectionError, WorkerResponseError])
def test_mediator_stop_recording_worker_errors(
    mediator, mock_worker_service, error_class
):
    """Test handling of worker errors during stop"""
    # Setup
    mock_recording = RecordingFactory(
        status=RecordingStatusChoices.ACTIVE, worker_id="test-worker-123"
    )
    mock_worker_service.stop.side_effect = error_class("Test error")

    # Execute and verify
    with pytest.raises(RecordingStopError):
        mediator.stop(mock_recording)

    # Verify recording updates
    mock_recording.refresh_from_db()
    assert mock_recording.status == RecordingStatusChoices.FAILED_TO_STOP
