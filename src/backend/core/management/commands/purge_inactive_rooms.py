"""Purge inactive and soft-deleted rooms."""

import operator
from datetime import timedelta
from functools import reduce
from itertools import batched
from logging import getLogger

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from core.models import Recording, RecordingStatusChoices, Room

logger = getLogger(__name__)

CHUNK_SIZE = 500


class Command(BaseCommand):
    """
    Delete rooms that have not been started for ROOM_INACTIVITY_DELETION_DAYS days:
    - rooms which were last started before that period
    - rooms never started and created before that period

    Also delete rooms soft deleted more than ROOM_DELETED_RETENTION_DAYS days ago.

    Rooms holding a saved recording that has not expired are kept.
    """

    help = "Purge inactive and soft-deleted rooms"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List the rooms that would be purged without deleting them",
        )

    def handle(self, *args, **options):
        """Browse purgeable rooms and delete them chunk by chunk."""

        if not (
            settings.ROOM_INACTIVITY_DELETION_DAYS
            or settings.ROOM_DELETED_RETENTION_DAYS
        ):
            self.stdout.write(
                "Purging rooms is disabled (neither ROOM_INACTIVITY_DELETION_DAYS "
                "nor ROOM_DELETED_RETENTION_DAYS is set)."
            )
            return

        now = timezone.now()
        purgeable_rooms = self.get_purgeable_rooms(now)

        purgeable_count = purgeable_rooms.count()
        if not purgeable_count:
            self.stdout.write("No room to purge.")
            return

        if options["dry_run"]:
            self.stdout.write(f"[dry-run] {purgeable_count} room(s) would be purged:")
            rooms = purgeable_rooms.values_list("name", "deleted_at")
            for name, deleted_at in rooms.iterator(chunk_size=CHUNK_SIZE):
                self.stdout.write(f"- {name}{' (deleted)' if deleted_at else ''}")
            return

        purged_count = 0
        rooms = purgeable_rooms.values_list("pk", "slug", "deleted_at").iterator(
            chunk_size=CHUNK_SIZE
        )
        for chunk in batched(rooms, CHUNK_SIZE, strict=False):
            for room_id, slug, deleted_at in chunk:
                state = "deleted" if deleted_at else "inactive"
                logger.info("Purging %s room %s (%s)", state, room_id, slug)

            _, deleted_by_model = purgeable_rooms.filter(
                pk__in=[room_id for room_id, _, _ in chunk]
            ).delete()
            purged_count += deleted_by_model.get("core.Room", 0)

        self.stdout.write(f"Purged {purged_count} room(s).")

    @staticmethod
    def get_purgeable_rooms(now):
        """Return the inactive or long-deleted rooms that no recording protects.

        Soft-deleted rooms are hidden by `Room.objects`, hence `Room.all_objects`.
        """

        conditions = []
        if settings.ROOM_INACTIVITY_DELETION_DAYS:
            threshold = now - timedelta(days=settings.ROOM_INACTIVITY_DELETION_DAYS)
            conditions.append(
                Q(last_started_at__lt=threshold)
                | Q(last_started_at__isnull=True, created_at__lt=threshold)
            )
        if settings.ROOM_DELETED_RETENTION_DAYS:
            deleted_before = now - timedelta(days=settings.ROOM_DELETED_RETENTION_DAYS)
            conditions.append(Q(deleted_at__lt=deleted_before))
        if not conditions:
            return Room.all_objects.none()

        protected_recordings = Recording.objects.filter(
            room=OuterRef("pk"), status__in=RecordingStatusChoices.saved_statuses()
        )
        if settings.RECORDING_EXPIRATION_DAYS:
            protected_recordings = protected_recordings.filter(
                created_at__gte=now - timedelta(days=settings.RECORDING_EXPIRATION_DAYS)
            )

        return Room.all_objects.filter(
            reduce(operator.or_, conditions), ~Exists(protected_recordings)
        )
