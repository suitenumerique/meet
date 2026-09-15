"""Purge deleted files."""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import File


class Command(BaseCommand):
    """Purge files (object storage and database object) whose trash bin retention has expired."""

    help = "Purge deleted files"

    def handle(self, *args, **options):
        """Delete files soft deleted for longer than the grace period."""

        threshold = timezone.now() - timedelta(days=settings.FILE_PURGE_GRACE_DAYS)

        count = 0
        failed = []
        for file in File.objects.filter(deleted_at__lte=threshold).iterator():
            try:
                file.delete()
                count += 1
            except Exception as exc:  # noqa: BLE001 # pylint: disable=broad-exception-caught
                failed.append(file.pk)
                self.stderr.write(f"[ERROR] Failed to purge file '{file.pk}': {exc}")

        self.stdout.write(f"Purged {count} deleted file(s).")

        if failed:
            raise CommandError(f"Failed to purge {len(failed)} file(s).")
