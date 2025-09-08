"""
Test rooms API endpoints in the Meet core app: start recording.
"""

# pylint: disable=redefined-outer-name,unused-argument

from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import Recording
from ...recording.worker.exceptions import RecordingStartError

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_worker_service():
    """Mock worker service."""
    return mock.Mock()


@pytest.fixture
def mock_worker_service_factory(mock_worker_service):
    """Mock worker service factory."""
    with mock.patch(
        "core.api.viewsets.get_worker_service",
        return_value=mock_worker_service,
    ) as mock_worker_service_factory:
        yield mock_worker_service_factory


@pytest.fixture
def mock_worker_manager(mock_worker_service):
    """Mock worker service mediator."""
    with mock.patch("core.api.viewsets.WorkerServiceMediator") as mock_mediator_class:
        mock_mediator = mock.Mock()
        mock_mediator_class.return_value = mock_mediator
        yield mock_mediator


def test_start_recording_anonymous():
    """Anonymous users should not be allowed to start room recordings."""
    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 401
    assert Recording.objects.count() == 0


def test_start_recording_non_owner_and_non_administrator(settings):
    """Non-owner and Non-Administrator users should not be allowed to start room recordings."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 403
    assert Recording.objects.count() == 0


def test_start_recording_recording_disabled(settings):
    """Should fail if recording is disabled for the room."""
    settings.RECORDING_ENABLE = False

    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found."}
    assert Recording.objects.count() == 0


def test_start_recording_missing_mode(settings):
    """Should fail if recording mode is not provided."""
    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/start-recording/", {})

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid request."}
    assert Recording.objects.count() == 0


def test_start_recording_worker_error(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Should handle worker service errors appropriately."""
    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    # Configure mock mediator to raise error
    mock_start = mock.Mock()
    mock_start.side_effect = RecordingStartError("Failed to connect to worker")

    mock_worker_manager.start = mock_start

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    mock_worker_service_factory.assert_called_once_with(mode="screen_recording")

    assert response.status_code == 500
    assert response.json() == {
        "error": f"Recording failed to start for room {room.slug}"
    }

    # Recording object should be created even if worker fails
    assert Recording.objects.count() == 1
    recording = Recording.objects.first()
    assert recording.room == room
    assert recording.mode == "screen_recording"

    # Verify recording access details
    assert recording.accesses.count() == 1
    access = recording.accesses.first()
    assert access.user == user
    assert access.role == "owner"


def test_start_recording_success(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Should successfully start recording when everything is configured correctly."""
    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    mock_start = mock.Mock()
    mock_worker_manager.start = mock_start

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    mock_worker_service_factory.assert_called_once_with(mode="screen_recording")

    assert response.status_code == 201
    assert response.json() == {
        "message": f"Recording successfully started for room {room.slug}"
    }

    # Verify the mediator was called with the recording
    recording = Recording.objects.first()
    mock_start.assert_called_once_with(recording)

    assert recording.room == room
    assert recording.mode == "screen_recording"

    # Verify recording access details
    assert recording.accesses.count() == 1
    access = recording.accesses.first()
    assert access.user == user
    assert access.role == "owner"
