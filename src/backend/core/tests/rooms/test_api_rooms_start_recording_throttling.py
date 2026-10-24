"""
Test rooms API endpoints in the Meet core app: start recording throttling.
"""

# pylint: disable=redefined-outer-name,unused-argument

from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...api.throttling import (
    StartRecordingDailyUserRateThrottle,
    StartRecordingUserRateThrottle,
)
from ...factories import RoomFactory, UserFactory
from ...models import Recording

pytestmark = pytest.mark.django_db


@pytest.fixture
def start_recording_throttle(monkeypatch):
    """Lower the start recording rates."""
    rates = StartRecordingUserRateThrottle.THROTTLE_RATES
    monkeypatch.setitem(rates, "start_recording", "2/minute")
    monkeypatch.setitem(rates, "start_recording_daily", "100/day")


@pytest.fixture
def daily_start_recording_throttle(monkeypatch):
    """Lower the daily start recording rate and control the clock."""
    rates = StartRecordingDailyUserRateThrottle.THROTTLE_RATES
    monkeypatch.setitem(rates, "start_recording", "100/minute")
    monkeypatch.setitem(rates, "start_recording_daily", "3/day")
    now = [1_000_000.0]
    monkeypatch.setattr(StartRecordingUserRateThrottle, "timer", lambda self: now[0])
    return now


@mock.patch("core.api.viewsets.WorkerServiceMediator")
@mock.patch("core.api.viewsets.get_worker_service")
def test_start_recording_throttled(
    mock_get_worker_service, mock_mediator_class, start_recording_throttle, settings
):
    """Starting a recording should return 429 when exceeding the per-minute rate."""
    settings.RECORDING_ENABLE = True
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    for _ in range(2):
        room = RoomFactory(users=[(user, "owner")])
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/start-recording/",
            {"mode": "screen_recording"},
        )
        assert response.status_code == 201

    room = RoomFactory(users=[(user, "owner")])
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 429
    assert 0 < int(response["Retry-After"]) <= 60
    assert Recording.objects.count() == 2
    assert mock_mediator_class.return_value.start.call_count == 2


@mock.patch("core.api.viewsets.WorkerServiceMediator")
@mock.patch("core.api.viewsets.get_worker_service")
def test_start_recording_throttle_counts_failed_attempts(
    mock_get_worker_service, mock_mediator_class, start_recording_throttle, settings
):
    """Failed recording starts should count toward the rate."""
    settings.RECORDING_ENABLE = True
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    Recording.objects.create(room=room, mode="screen_recording", status="active")
    client = APIClient()
    client.force_login(user)

    for _ in range(2):
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/start-recording/",
            {"mode": "screen_recording"},
        )
        assert response.status_code == 409

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 429


@mock.patch("core.api.viewsets.WorkerServiceMediator")
@mock.patch("core.api.viewsets.get_worker_service")
def test_start_recording_throttle_per_user(
    mock_get_worker_service, mock_mediator_class, start_recording_throttle, settings
):
    """Starting a recording should succeed when another user is throttled."""
    settings.RECORDING_ENABLE = True
    client = APIClient()

    user = UserFactory()
    client.force_login(user)
    for _ in range(2):
        room = RoomFactory(users=[(user, "owner")])
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/start-recording/",
            {"mode": "screen_recording"},
        )
        assert response.status_code == 201

    room = RoomFactory(users=[(user, "owner")])
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )
    assert response.status_code == 429

    other_user = UserFactory()
    client.force_login(other_user)
    room = RoomFactory(users=[(other_user, "owner")])
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 201


@mock.patch("core.api.viewsets.WorkerServiceMediator")
@mock.patch("core.api.viewsets.get_worker_service")
def test_start_recording_throttle_does_not_limit_other_actions(
    mock_get_worker_service, mock_mediator_class, start_recording_throttle, settings
):
    """Other room actions should succeed when starting a recording is throttled."""
    settings.RECORDING_ENABLE = True
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    rooms = RoomFactory.create_batch(3, users=[(user, "owner")])
    for room in rooms[:2]:
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/start-recording/",
            {"mode": "screen_recording"},
        )
        assert response.status_code == 201

    response = client.post(
        f"/api/v1.0/rooms/{rooms[2].id}/start-recording/",
        {"mode": "screen_recording"},
    )
    assert response.status_code == 429

    Recording.objects.filter(room=rooms[0]).update(status="active")
    response = client.post(f"/api/v1.0/rooms/{rooms[0].id}/stop-recording/")
    assert response.status_code == 200

    response = client.get("/api/v1.0/rooms/")
    assert response.status_code == 200

    response = client.post("/api/v1.0/rooms/", {"name": "New room"})
    assert response.status_code == 201


@mock.patch("core.api.viewsets.WorkerServiceMediator")
@mock.patch("core.api.viewsets.get_worker_service")
def test_start_recording_daily_throttled(
    mock_get_worker_service,
    mock_mediator_class,
    daily_start_recording_throttle,
    settings,
):
    """Starting a recording should return 429 when exceeding the daily rate."""
    settings.RECORDING_ENABLE = True
    now = daily_start_recording_throttle
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    for _ in range(3):
        room = RoomFactory(users=[(user, "owner")])
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/start-recording/",
            {"mode": "screen_recording"},
        )
        assert response.status_code == 201
        now[0] += 120

    room = RoomFactory(users=[(user, "owner")])
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )
    assert response.status_code == 429
    assert 60 < int(response["Retry-After"]) <= 86400

    now[0] += 86400
    room = RoomFactory(users=[(user, "owner")])
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 201
