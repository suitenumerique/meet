"""Clear the OIDC claims stored on users."""

from itertools import batched
from logging import getLogger

from django.core.management.base import BaseCommand
from django.db.models import Q

from core.models import User

logger = getLogger(__name__)

CHUNK_SIZE = 500


class Command(BaseCommand):
    """
    Remove the OIDC claims stored on users, either all of them or only the given ones.

    Claims that are removed from OIDC_USERINFO_STORED_CLAIMS are only dropped on
    each user's next login, so inactive users keep them until this command runs.
    """

    help = "Clear the OIDC claims stored on users"

    def add_arguments(self, parser):
        parser.add_argument(
            "--claim",
            action="append",
            dest="claims",
            help="Claim to remove (repeatable). Without it, all stored claims are cleared.",
        )

    def handle(self, *args, **options):
        claims = options["claims"]

        if claims:
            users = User.objects.filter(
                Q(*(Q(claims__has_key=claim) for claim in claims), _connector=Q.OR)
            )
        else:
            users = User.objects.exclude(claims={})

        updated = 0
        for chunk in batched(
            users.iterator(chunk_size=CHUNK_SIZE), CHUNK_SIZE, strict=False
        ):
            for user in chunk:
                user.claims = (
                    {k: v for k, v in user.claims.items() if k not in claims}
                    if claims
                    else {}
                )
            User.objects.bulk_update(chunk, ["claims"])
            updated += len(chunk)

        message = f"Cleared stored claims for {updated} user(s)"
        logger.info(message)
        self.stdout.write(message)
