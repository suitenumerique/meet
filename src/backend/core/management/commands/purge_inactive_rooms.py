"""Purge inactive rooms."""

from datetime import timedelta
from itertools import batched
from logging import getLogger

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from core.models import Recording, RecordingStatusChoices, Room

logger = getLogger(__name__)

CHUNK_SIZE = 500

UNSUCCESSFUL_RECORDING_STATUSES = [
    status
    for status in RecordingStatusChoices
    if RecordingStatusChoices.is_unsuccessful(status)
]


class Command(BaseCommand):
    """
    Delete rooms that have not been started for ROOM_INACTIVITY_DELETION_DAYS days:
    - rooms which were last started before that period
    - rooms never started and created before that period

    Rooms holding a recording their users may still access are kept.
    """

    help = "Purge inactive rooms"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List the rooms that would be purged without deleting them",
        )

    def handle(self, *args, **options):
        """Browse inactive rooms and delete them chunk by chunk."""

        if not settings.ROOM_INACTIVITY_DELETION_DAYS:
            self.stdout.write(
                "Purging inactive rooms is disabled "
                "(ROOM_INACTIVITY_DELETION_DAYS is not set)."
            )
            return

        now = timezone.now()
        inactive_rooms = self.get_inactive_rooms(now)

        inactive_count = inactive_rooms.count()
        if not inactive_count:
            self.stdout.write("No inactive room to purge.")
            return

        if options["dry_run"]:
            self.stdout.write(
                f"[dry-run] {inactive_count} inactive room(s) would be purged:"
            )
            names = inactive_rooms.values_list("name", flat=True)
            for name in names.iterator(chunk_size=CHUNK_SIZE):
                self.stdout.write(f"- {name}")
            return

        purged_count = 0
        rooms = inactive_rooms.values_list("pk", "slug").iterator(chunk_size=CHUNK_SIZE)
        for chunk in batched(rooms, CHUNK_SIZE, strict=False):
            for room_id, slug in chunk:
                logger.info("Purging inactive room %s (%s)", room_id, slug)

            _, deleted_by_model = inactive_rooms.filter(
                pk__in=[room_id for room_id, _ in chunk]
            ).delete()
            purged_count += deleted_by_model.get("core.Room", 0)

        self.stdout.write(f"Purged {purged_count} inactive room(s).")

    @staticmethod
    def get_inactive_rooms(now):
        """Return the rooms inactive for too long that no recording protects."""

        threshold = now - timedelta(days=settings.ROOM_INACTIVITY_DELETION_DAYS)
        is_inactive = Q(last_started_at__lt=threshold) | Q(
            last_started_at__isnull=True, created_at__lt=threshold
        )

        protecting_recordings = Recording.objects.filter(room=OuterRef("pk")).exclude(
            status__in=UNSUCCESSFUL_RECORDING_STATUSES
        )
        if settings.RECORDING_EXPIRATION_DAYS:
            protecting_recordings = protecting_recordings.filter(
                created_at__gte=now - timedelta(days=settings.RECORDING_EXPIRATION_DAYS)
            )

        return Room.objects.filter(is_inactive, ~Exists(protecting_recordings))
