"""Celery tasks for the core app."""

from core.tasks.connection_test import delete_connection_test_room

__all__ = ("delete_connection_test_room",)
