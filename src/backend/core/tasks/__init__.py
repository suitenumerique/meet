"""Asynchronous tasks of the core application.

Importing the task modules here is what makes Celery's `autodiscover_tasks`
register them: it only imports the `core.tasks` package itself, never its
submodules.
"""

from core.tasks.file import process_file_deletion
from core.tasks.push_recording import push_recording

__all__ = ["process_file_deletion", "push_recording"]
