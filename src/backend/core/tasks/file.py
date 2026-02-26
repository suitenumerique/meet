"""
Tasks related to files.
"""

import logging

from django.core.files.storage import default_storage

from core.models import File
from core.tasks._task import task

logger = logging.getLogger(__name__)


@task
def process_file_deletion(file_id):
    """
    Process the deletion of a file.
    Definitely delete it in the database.
    Delete the files from the storage.
    """
    logger.info("Processing item deletion for %s", file_id)
    try:
        file = File.objects.get(id=file_id)
    except File.DoesNotExist:
        logger.error("Item %s does not exist", file_id)
        return

    if file.hard_deleted_at is None:
        logger.error("To process an item deletion, it must be hard deleted first.")
        return

    logger.info("Deleting file %s", file.file_key)
    default_storage.delete(file.file_key)

    file.delete()
