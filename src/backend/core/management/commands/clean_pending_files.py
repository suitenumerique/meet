"""Clean stale pending files that were never fully uploaded."""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import File, FileUploadStateChoices
from core.tasks.file import process_file_deletion


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
            hard_deleted_at__isnull=True,
        )

        count = 0
        for file in files.iterator():
            # This check shouldn't happen, but just in case we do it to avoid an error
            if not file.deleted_at:
                file.soft_delete()
            file.hard_delete()
            process_file_deletion(file.id)
            count += 1

        self.stdout.write(f"Cleaned {count} stale pending file(s).")
