"""Tests for connection test Celery tasks."""

from unittest import mock

from django.test.utils import override_settings

from core.services.room_management import (
    RoomManagementException,
    RoomNotFoundException,
)
from core.tasks.connection_test import delete_connection_test_room


@mock.patch("core.tasks.connection_test.RoomManagement.delete_room")
def test_delete_connection_test_room_calls_room_management(mock_delete_room, settings):
    """RoomManagement.delete_room is called for connection-test rooms."""
    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"
    delete_connection_test_room("connection-test-abc")

    mock_delete_room.assert_called_once_with("connection-test-abc")


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

    delete_connection_test_room("connection-test-gone")

    mock_delete_room.assert_called_once_with("connection-test-gone")


@mock.patch("core.tasks.connection_test.RoomManagement.delete_room")
def test_delete_connection_test_room_logs_other_failures(mock_delete_room, settings):
    """Unexpected LiveKit failures are swallowed after logging."""
    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"
    mock_delete_room.side_effect = RoomManagementException("Could not delete room")

    delete_connection_test_room("connection-test-fail")

    mock_delete_room.assert_called_once_with("connection-test-fail")
