"""
Test rooms API endpoints in the Meet core app: stop recording.
"""

# pylint: disable=redefined-outer-name,unused-argument,no-member,protected-access

from unittest import mock

import pytest
from livekit import api as livekit_api
from rest_framework.test import APIClient

from ... import utils
from ...audit.testing import find_events
from ...factories import RecordingFactory, RoomFactory, UserFactory
from ...livekit.clusters import get_default_livekit_cluster
from ...models import Placement, Recording, RecordingStatusChoices, RoomAccessLevel
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


@pytest.mark.parametrize(
    "recording_enabled, expected_status",
    [(True, 401), (False, 404)],
)
def test_stop_recording_anonymous(settings, recording_enabled, expected_status):
    """Anonymous users should not be allowed to stop room recordings."""
    settings.RECORDING_ENABLE = recording_enabled
    room = RoomFactory()
    RecordingFactory(room=room, status=RecordingStatusChoices.ACTIVE)
    client = APIClient()

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == expected_status
    # Verify recording status hasn't changed
    assert Recording.objects.filter(status=RecordingStatusChoices.ACTIVE).count() == 1


def test_stop_recording_non_owner_and_non_administrator(settings):
    """Non-owner and Non-Administrator users should not be allowed to stop room recordings."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
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

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found."}
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

    mock_worker_service_factory.assert_called_once_with(
        mode="screen_recording", cluster=get_default_livekit_cluster()
    )
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

    mock_worker_service_factory.assert_called_once_with(
        mode="screen_recording", cluster=get_default_livekit_cluster()
    )
    mock_stop.assert_called_once_with(recording)

    assert response.status_code == 200
    assert response.json() == {"message": f"Recording stopped for room {room.slug}."}

    # Verify the recording still exists
    assert Recording.objects.count() == 1


@mock.patch("core.utils.create_livekit_client")
def test_stop_recording_on_the_recording_cluster(
    mock_create_livekit_client, settings, two_livekit_clusters
):
    """A recording is stopped on the LiveKit cluster recording the room, even
    once the room was placed elsewhere."""
    settings.RECORDING_ENABLE = True
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    recording = RecordingFactory(
        room=room,
        status=RecordingStatusChoices.ACTIVE,
        worker_id="EG_lyon",
        livekit_cluster="lyon",
    )
    Placement.objects.create(room_name=str(room.id), room=room, cluster="paris")
    client = mock.AsyncMock()
    client._egress.stop_egress.return_value = mock.Mock(
        status=livekit_api.EgressStatus.EGRESS_ENDING
    )
    mock_create_livekit_client.return_value = client
    api_client = APIClient()
    api_client.force_login(user)

    response = api_client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == 200
    mock_create_livekit_client.assert_called_once_with(
        utils.livekit_api_configuration(lyon)
    )
    client._egress.stop_egress.assert_awaited_once_with(
        livekit_api.StopEgressRequest(egress_id="EG_lyon")
    )
    recording.refresh_from_db()
    assert recording.status == RecordingStatusChoices.STOPPED


@pytest.mark.usefixtures("mock_worker_manager")
@pytest.mark.parametrize("livekit_cluster", ["", "lille"])
def test_stop_recording_on_the_default_cluster(
    livekit_cluster, mock_worker_service_factory, settings, two_livekit_clusters
):
    """A recording naming no LiveKit cluster, as one started before recordings
    kept theirs, or naming a cluster no longer registered, is stopped on the
    default cluster, wherever the room is placed."""
    settings.RECORDING_ENABLE = True
    paris, _lyon = two_livekit_clusters
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    RecordingFactory(
        room=room,
        status=RecordingStatusChoices.ACTIVE,
        mode="screen_recording",
        livekit_cluster=livekit_cluster,
    )
    Placement.objects.create(room_name=str(room.id), room=room, cluster="lyon")
    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == 200
    mock_worker_service_factory.assert_called_once_with(
        mode="screen_recording", cluster=paris
    )


def test_stop_recording_is_audited(
    settings, mock_worker_service_factory, mock_worker_manager, audit_events
):
    """A stopped recording is the target of the event."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    recording = RecordingFactory(
        room=room, mode="transcript", status=RecordingStatusChoices.ACTIVE
    )
    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == 200

    [event] = find_events(audit_events, "recording.stop")

    assert event["event"]["type"] == ["end"]
    assert event["lasuite"]["outcome"] == "success"
    assert event["entity"]["target"]["id"] == str(recording.pk)
    assert event["entity"]["target"]["raw"]["mode"] == "transcript"


def test_stop_recording_without_active_recording_is_audited(settings, audit_events):
    """Stopping a room that records nothing fails on the room."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == 404

    [event] = find_events(audit_events, "recording.stop")

    assert event["event"]["reason"] == "not_found"
    assert event["entity"]["target"]["sub_type"] == "room"
