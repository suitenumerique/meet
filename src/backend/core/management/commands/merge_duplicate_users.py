"""Management command to merge duplicate users based on their email address."""

# pylint: disable=too-many-locals

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count
from django.db.models.functions import Lower

from core.models import File, RecordingAccess, ResourceAccess, RoleChoices

User = get_user_model()

ROLE_PRIORITY = {
    RoleChoices.OWNER: 3,
    RoleChoices.ADMIN: 2,
    RoleChoices.MEMBER: 1,
}


class Command(BaseCommand):
    """
    Merge duplicate users sharing the same email (case-insensitive) into the
    most recently created one.

    Emails are compared case-insensitively, so 'John@Example.com' and
    'john@example.com' are treated as duplicates. The KEPT user is the most
    recently created. All room memberships, recording accesses and files are
    transferred to it. When a conflict exists, the higher-privilege role wins.
    Stale users are then deleted.
    Each email group is processed inside a single database transaction.
    """

    help = __doc__

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Simulate the merge without writing any changes to the database.",
        )
        parser.add_argument(
            "--email-filter",
            type=str,
            default=None,
            help="Only merge users whose email contains this string (e.g. '@example.com').",
        )

    def handle(self, *args, **options):
        """Execute the management command."""
        dry_run = options["dry_run"]
        email_filter = options["email_filter"]

        if dry_run:
            self.stdout.write("[DRY-RUN] No changes will be written.\n")

        users_qs = User.objects.all()
        if email_filter:
            users_qs = users_qs.filter(email__icontains=email_filter)
            self.stdout.write(f"[INFO] Filtering emails containing '{email_filter}'.\n")

        # Group emails case-insensitively so 'John@X.com' and 'john@x.com'
        # are detected as duplicates of each other.
        duplicate_emails = (
            users_qs.exclude(email__isnull=True)
            .exclude(email="")
            .annotate(email_lower=Lower("email"))
            .values("email_lower")
            .annotate(cnt=Count("id"))
            .filter(cnt__gt=1)
            .values_list("email_lower", flat=True)
        )

        if not duplicate_emails:
            self.stdout.write("[INFO] No duplicate users found. Nothing to do.")
            return

        self.stdout.write(
            f"[INFO] Found {len(duplicate_emails)} email(s) with duplicate users."
        )

        total_merged = 0
        total_deleted = 0
        failed_emails = []

        for email in duplicate_emails:
            # Case-insensitive lookup to fetch every casing variant of the email.
            # Secondary sort by id ensures a stable, deterministic order when
            # created_at timestamps are equal (common in tests and bulk imports).
            users = list(
                User.objects.filter(email__iexact=email).order_by("created_at", "id")
            )
            kept_user = users[-1]
            stale_users = users[:-1]

            self.stdout.write(
                f"\n[INFO] Email '{email}': {len(users)} users — "
                f"keeping {kept_user.id} (created {kept_user.created_at.date()})."
            )
            for u in stale_users:
                self.stdout.write(
                    f"       stale: {u.id} (created {u.created_at.date()})"
                )

            if dry_run:
                ra_count = ResourceAccess.objects.filter(user__in=stale_users).count()
                rca_count = RecordingAccess.objects.filter(user__in=stale_users).count()
                f_count = File.objects.filter(creator__in=stale_users).count()
                self.stdout.write(
                    f"       [DRY-RUN] Would migrate: {ra_count} ResourceAccess, "
                    f"{rca_count} RecordingAccess, {f_count} File(s)."
                )
                continue

            try:
                group_deleted = 0
                with transaction.atomic():
                    for stale_user in stale_users:
                        self._merge_resource_accesses(stale_user, kept_user)
                        self._merge_recording_accesses(stale_user, kept_user)
                        self._merge_files(stale_user, kept_user)
                        stale_user.delete()
                        group_deleted += 1

                total_deleted += group_deleted
                total_merged += 1

            except Exception as exc:  # noqa: BLE001 #pylint: disable=broad-exception-caught
                failed_emails.append(email)
                self.stderr.write(f"[ERROR] Failed to merge '{email}': {exc}")

            if not kept_user.email.islower():
                kept_user.email = kept_user.email.lower()
                kept_user.save(update_fields=["email"])

        if failed_emails:
            raise CommandError(
                f"Failed to merge {len(failed_emails)} email group(s): {', '.join(failed_emails)}"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"\n[DONE] Merged {total_merged} group(s), deleted {total_deleted} user(s)."
            )
        )

    def _merge_resource_accesses(self, stale_user, kept_user):
        """Transfer room memberships from stale_user to kept_user."""
        for ra in ResourceAccess.objects.filter(user=stale_user):
            existing = ResourceAccess.objects.filter(
                user=kept_user, resource=ra.resource
            ).first()

            if existing is None:
                ra.user = kept_user
                ra.save(update_fields=["user"])
            else:
                if ROLE_PRIORITY.get(ra.role, 0) > ROLE_PRIORITY.get(existing.role, 0):
                    existing.role = ra.role
                    existing.save(update_fields=["role"])
                ra.delete()

    def _merge_recording_accesses(self, stale_user, kept_user):
        """Transfer recording accesses from stale_user to kept_user."""
        for rca in RecordingAccess.objects.filter(user=stale_user):
            existing = RecordingAccess.objects.filter(
                user=kept_user, recording=rca.recording
            ).first()

            if existing is None:
                rca.user = kept_user
                rca.save(update_fields=["user"])
            else:
                if ROLE_PRIORITY.get(rca.role, 0) > ROLE_PRIORITY.get(existing.role, 0):
                    existing.role = rca.role
                    existing.save(update_fields=["role"])
                rca.delete()

    def _merge_files(self, stale_user, kept_user):
        """Re-assign files created by stale_user to kept_user."""
        File.objects.filter(creator=stale_user).update(creator=kept_user)
