"""Reconcile the placements of LiveKit rooms with their LiveKit clusters."""

from logging import getLogger

from django.core.management.base import BaseCommand, CommandError

from core.livekit.reconciliation import reconcile

logger = getLogger(__name__)


class Command(BaseCommand):
    """
    Reconcile the placements of LiveKit rooms with the LiveKit rooms live on
    every registered LiveKit cluster: see core.livekit.reconciliation. Webhooks
    may be lost at any time, so this is meant to run every minute.

    One line sums up what was done, each action being logged. A cluster that
    cannot be listed is left alone, and counted: only an unexpected error fails
    the command.
    """

    help = "Reconcile the placements of LiveKit rooms with their LiveKit clusters"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Count the actions the reconciliation would take without taking them",
        )

    def handle(self, *args, **options):
        """Reconcile the placements, then sum up what was done."""

        dry_run = options["dry_run"]
        try:
            report = reconcile(dry_run=dry_run)
        except Exception as error:
            logger.exception("The reconciliation of LiveKit placements failed")
            raise CommandError(
                "The reconciliation of LiveKit placements failed, as logged."
            ) from error

        prefix = "[dry-run] " if dry_run else ""
        self.stdout.write(f"{prefix}{report.summary()}")
