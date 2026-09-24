"""Move public rooms to trusted, for good, and clear the defaults pointing at them."""

from django.core.management.base import BaseCommand
from django.utils import timezone

from core import models
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
)


class Command(BaseCommand):
    """Convert the rows an instance forbidding public rooms still holds as public."""

    help = (
        "Move the rooms still stored public to trusted, for good, and clear the "
        "user defaults that point at the open level, so that allowing public "
        "rooms again does not reopen them. Run this after turning "
        "ALLOW_PUBLIC_ROOMS off and restarting: until it runs, such rooms run "
        "as trusted at read time and keep their stored level. --dry-run reports "
        "what would change and changes nothing."
    )

    def add_arguments(self, parser):
        """Take the dry-run flag."""
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report the rows that would change without changing any.",
        )

    def handle(self, *args, **options):
        """Move the rows, or report them under --dry-run."""
        if not models.is_public_level_forbidden(models.RoomAccessLevel.PUBLIC):
            self.stdout.write("ALLOW_PUBLIC_ROOMS is on; nothing to move.")
            return

        rooms = models.Room.objects.filter(access_level=models.RoomAccessLevel.PUBLIC)
        users = models.User.objects.filter(
            default_room_access_level=models.RoomAccessLevel.PUBLIC
        )

        if options["dry_run"]:
            self.stdout.write(
                f"Would move {rooms.count()} room(s) and clear {users.count()} "
                "user default(s):"
            )
            for room in rooms.order_by("slug"):
                self.stdout.write(f"  room {room.slug}")
            for user in users.order_by("email"):
                self.stdout.write(f"  default cleared for {user}")
            self.stdout.write("Nothing changed.")
            return

        moved_ids = {str(room_id) for room_id in rooms.values_list("id", flat=True)}
        moved_at = timezone.now()
        room_count = rooms.update(
            access_level=models.RoomAccessLevel.TRUSTED, updated_at=moved_at
        )
        user_count = users.update(default_room_access_level=None, updated_at=moved_at)
        self.stdout.write(
            f"Moved {room_count} room(s) and cleared {user_count} user default(s)."
        )

        if moved_ids:
            self.push_level_to_live_rooms(moved_ids)

    def push_level_to_live_rooms(self, moved_ids):
        """Tell the meetings running in the moved rooms their new level.

        Their level changed when the instance restarted with public rooms
        forbidden; this push is what tells the meetings running then. Only
        the rooms LiveKit holds right now are pushed, found in one listing,
        since an instance can hold far more rooms than are live.
        """
        try:
            live_ids = RoomManagement.list_live_room_names()
        except RoomManagementException:
            self.stderr.write(
                "Could not reach LiveKit: meetings running now show their "
                "new level once reloaded."
            )
            return

        live_rooms = models.Room.objects.filter(id__in=moved_ids & live_ids)
        for room in live_rooms:
            RoomManagement.sync_room_metadata(room)
        self.stdout.write(f"Pushed the new level to {len(live_rooms)} live meeting(s).")
