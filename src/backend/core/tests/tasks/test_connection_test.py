"""Tests for connection test Celery tasks."""

import logging
from unittest import mock

import pytest

from core.livekit.clusters import get_default_livekit_cluster
from core.services.room_management import (
    RoomManagementException,
    RoomNotFoundException,
)
from core.tasks.connection_test import delete_connection_test_room


@mock.patch("core.tasks.connection_test.RoomManagement.delete_room")
def test_delete_connection_test_room_calls_room_management(mock_delete_room, settings):
    """RoomManagement.delete_room is called for connection-test rooms, on the
    default LiveKit cluster when the task names none, as tasks queued before
    connection test rooms were created on a chosen cluster do."""
    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"
    delete_connection_test_room("connection-test-abc")

    mock_delete_room.assert_called_once_with(
        "connection-test-abc", cluster=get_default_livekit_cluster()
    )


@mock.patch("core.tasks.connection_test.RoomManagement.delete_room")
def test_delete_connection_test_room_on_its_cluster(
    mock_delete_room, settings, two_livekit_clusters
):
    """A connection-test room is deleted on the LiveKit cluster it was created on."""
    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"
    _paris, lyon = two_livekit_clusters

    delete_connection_test_room("connection-test-abc", "lyon")

    mock_delete_room.assert_called_once_with("connection-test-abc", cluster=lyon)


@pytest.mark.usefixtures("two_livekit_clusters")
@mock.patch("core.tasks.connection_test.RoomManagement.delete_room")
def test_delete_connection_test_room_on_unregistered_cluster(
    mock_delete_room, settings, caplog
):
    """A connection-test room created on a LiveKit cluster since removed from
    the registry is deleted on the default cluster, with a warning."""
    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"

    with caplog.at_level(logging.WARNING, logger="core.tasks.connection_test"):
        delete_connection_test_room("connection-test-abc", "lille")

    mock_delete_room.assert_called_once_with(
        "connection-test-abc", cluster=get_default_livekit_cluster()
    )
    assert get_default_livekit_cluster().name == "paris"
    assert (
        "Connection test room 'connection-test-abc' was created on LiveKit cluster "
        "lille, which is not registered: deleting it on the default cluster paris."
    ) in caplog.text


@mock.patch("core.tasks.connection_test.RoomManagement.delete_room")
def test_delete_connection_test_room_refuses_other_rooms(mock_delete_room, settings):
    """Refuse to delete rooms outside the connection-test namespace."""
    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"
    delete_connection_test_room("production-room")

    mock_delete_room.assert_not_called()


@mock.patch("core.tasks.connection_test.RoomManagement.delete_room")
def test_delete_connection_test_room_ignores_missing_room(mock_delete_room, settings):
    """Missing rooms are treated as already cleaned up."""
    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"
    mock_delete_room.side_effect = RoomNotFoundException("Room does not exist")

    delete_connection_test_room("connection-test-gone", "default")

    mock_delete_room.assert_called_once_with(
        "connection-test-gone", cluster=get_default_livekit_cluster()
    )


@mock.patch("core.tasks.connection_test.RoomManagement.delete_room")
def test_delete_connection_test_room_logs_other_failures(mock_delete_room, settings):
    """Unexpected LiveKit failures are swallowed after logging."""
    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"
    mock_delete_room.side_effect = RoomManagementException("Could not delete room")

    delete_connection_test_room("connection-test-fail", "default")

    mock_delete_room.assert_called_once_with(
        "connection-test-fail", cluster=get_default_livekit_cluster()
    )
