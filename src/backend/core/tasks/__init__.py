"""Celery tasks for the core app."""

from core.tasks.connection_test import delete_connection_test_room
from core.tasks.file import process_file_deletion

__all__ = (
    "delete_connection_test_room",
    "process_file_deletion",
)
