"""Purge deleted files."""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from core.models import File
from core.tasks.file import process_file_deletion


class Command(BaseCommand):
    """
    Purge deleted files (object storage and database object):
    - files marked as hard deleted in database
    - files marked as soft deleted and for which the trashbin retention period has expired
    """

    help = "Purge deleted files"

    def handle(self, *args, **options):
        """Browse purgeable files and queue them through the file deletion task."""

        is_hard_deleted = Q(hard_deleted_at__isnull=False)
        is_purgeable = Q(
            deleted_at__lte=timezone.now()
            - timedelta(days=settings.FILE_PURGE_GRACE_DAYS)
        )

        count = 0
        for file in File.objects.filter(is_hard_deleted | is_purgeable).iterator():
            if file.hard_deleted_at is None:
                file.hard_delete()

            process_file_deletion.delay(file.id)
            count += 1

        self.stdout.write(f"Purged {count} deleted file(s).")
