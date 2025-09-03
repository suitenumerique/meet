"""
Test rooms API endpoints in the Meet core app: stop recording.
"""

# pylint: disable=redefined-outer-name,unused-argument

from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...factories import RecordingFactory, RoomFactory, UserFactory
from ...models import Recording, RecordingStatusChoices
from ...recording.worker.exceptions import RecordingStopError

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


def test_stop_recording_anonymous():
    """Anonymous users should not be allowed to stop room recordings."""
    room = RoomFactory()
    RecordingFactory(room=room, status=RecordingStatusChoices.ACTIVE)
    client = APIClient()

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == 401
    # Verify recording status hasn't changed
    assert Recording.objects.filter(status=RecordingStatusChoices.ACTIVE).count() == 1


def test_stop_recording_non_owner_and_non_administrator():
    """Non-owner and Non-Administrator users should not be allowed to stop room recordings."""
    room = RoomFactory()
    user = UserFactory()
    RecordingFactory(room=room, status=RecordingStatusChoices.ACTIVE)
    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == 403
    # Verify recording status hasn't changed
    assert Recording.objects.filter(status=RecordingStatusChoices.ACTIVE).count() == 1


def test_stop_recording_recording_disabled(settings):
    """Should fail if recording is disabled for the room."""

    settings.RECORDING_ENABLE = False

    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == 403
    assert response.json() == {"detail": "Access denied, recording is disabled."}
    # Verify no recording exists
    assert Recording.objects.count() == 0


def test_stop_recording_no_active_recording(settings):
    """Should fail when there is no active recording for the room."""

    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == 404
    assert response.json() == {"detail": "No active recording found for this room."}


def test_stop_recording_worker_error(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Should handle worker service errors appropriately."""

    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    recording = RecordingFactory(
        room=room,
        status=RecordingStatusChoices.ACTIVE,
        mode="screen_recording",
    )
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    # Configure mock mediator to raise error
    mock_stop = mock.Mock()
    mock_stop.side_effect = RecordingStopError("Failed to connect to worker")
    mock_worker_manager.stop = mock_stop

    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    mock_worker_service_factory.assert_called_once_with(mode="screen_recording")
    mock_stop.assert_called_once_with(recording)

    assert response.status_code == 500
    assert response.json() == {
        "error": f"Recording failed to stop for room {room.slug}"
    }
    # Verify recording status hasn't changed
    assert Recording.objects.filter(status=RecordingStatusChoices.ACTIVE).count() == 1


def test_stop_recording_success(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Should successfully stop recording when everything is configured correctly."""

    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    recording = RecordingFactory(
        room=room,
        status=RecordingStatusChoices.ACTIVE,
        mode="screen_recording",
    )
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    mock_stop = mock.Mock()
    mock_worker_manager.stop = mock_stop

    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    mock_worker_service_factory.assert_called_once_with(mode="screen_recording")
    mock_stop.assert_called_once_with(recording)

    assert response.status_code == 200
    assert response.json() == {"message": f"Recording stopped for room {room.slug}."}

    # Verify the recording still exists
    assert Recording.objects.count() == 1
