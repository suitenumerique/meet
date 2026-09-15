"""Clean stale pending files that were never fully uploaded."""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import File, FileUploadStateChoices


class Command(BaseCommand):
    """Remove pending files older than a given threshold."""

    help = "Delete pending files that have been stuck for too long"

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours",
            type=int,
            default=24,
            help="Age threshold in hours (default: 24)",
        )

    def handle(self, *args, **options):
        hours = options["hours"]
        if hours < 0:
            raise CommandError("Hours must be greater than 0")

        threshold = timezone.now() - timedelta(hours=hours)

        files = File.objects.filter(
            upload_state=FileUploadStateChoices.PENDING,
            created_at__lt=threshold,
        )

        count = 0
        failed = []
        for file in files.iterator():
            try:
                file.delete()
                count += 1
            except Exception as exc:  # noqa: BLE001 # pylint: disable=broad-exception-caught
                failed.append(file.pk)
                self.stderr.write(f"[ERROR] Failed to clean file '{file.pk}': {exc}")

        self.stdout.write(f"Cleaned {count} stale pending file(s).")

        if failed:
            raise CommandError(f"Failed to clean {len(failed)} file(s).")
