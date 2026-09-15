"""Purge deleted files."""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import File


class Command(BaseCommand):
    """Purge files (object storage and database object) whose trash bin retention has expired."""

    help = "Purge deleted files"

    def handle(self, *args, **options):
        """Delete files soft deleted for longer than the grace period."""

        threshold = timezone.now() - timedelta(days=settings.FILE_PURGE_GRACE_DAYS)

        count = 0
        for file in File.objects.filter(deleted_at__lte=threshold).iterator():
            file.delete()
            count += 1

        self.stdout.write(f"Purged {count} deleted file(s).")
