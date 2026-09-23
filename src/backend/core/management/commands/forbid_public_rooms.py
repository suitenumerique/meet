"""Move public rooms to trusted, for good, and clear the defaults pointing at them."""

from django.core.management.base import BaseCommand
from django.utils import timezone

from core import models


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

        moved_at = timezone.now()
        room_count = rooms.update(
            access_level=models.RoomAccessLevel.TRUSTED, updated_at=moved_at
        )
        user_count = users.update(default_room_access_level=None, updated_at=moved_at)
        self.stdout.write(
            f"Moved {room_count} room(s) and cleared {user_count} user default(s)."
        )
