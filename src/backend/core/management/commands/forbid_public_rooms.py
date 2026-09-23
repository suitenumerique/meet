"""Move public rooms and user defaults to trusted, for good."""

from django.core.management.base import BaseCommand
from django.utils import timezone

from core import models


class Command(BaseCommand):
    """Convert the rows an instance forbidding public rooms still holds as public."""

    help = (
        "Move the rooms and user defaults still stored public to trusted, for "
        "good, so that allowing public rooms again does not reopen them. Run "
        "this after turning ALLOW_PUBLIC_ROOMS off and restarting: until it "
        "runs, such rooms run as trusted at read time and keep their stored "
        "level; writing that level in the settings stores it. --dry-run "
        "reports what would move and changes nothing."
    )

    def add_arguments(self, parser):
        """Take the dry-run flag."""
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report the rows that would move without changing any.",
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
                f"Would move {rooms.count()} room(s) and {users.count()} user "
                "default(s) from public to trusted:"
            )
            for room in rooms.order_by("slug"):
                self.stdout.write(f"  room {room.slug}")
            for user in users.order_by("email"):
                self.stdout.write(f"  user {user}")
            self.stdout.write("Nothing changed.")
            return

        moved_at = timezone.now()
        room_count = rooms.update(
            access_level=models.RoomAccessLevel.TRUSTED, updated_at=moved_at
        )
        user_count = users.update(
            default_room_access_level=models.RoomAccessLevel.TRUSTED,
            updated_at=moved_at,
        )
        self.stdout.write(
            f"Moved {room_count} room(s) and {user_count} user default(s) from "
            "public to trusted."
        )
