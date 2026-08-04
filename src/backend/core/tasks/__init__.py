"""Asynchronous tasks of the core application.

Importing the task modules here is what makes Celery's `autodiscover_tasks`
register them: it only imports the `core.tasks` package itself, never its
submodules.
"""

from core.tasks.connection_test import delete_connection_test_room
from core.tasks.file import process_file_deletion
from core.tasks.push_recording import push_recording
from core.tasks.mail import send_email

__all__ = ["delete_connection_test_room", "process_file_deletion", "push_recording", "send_email"]
