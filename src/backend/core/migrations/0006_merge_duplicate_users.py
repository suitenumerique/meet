from django.db import migrations
from django.db.models import Count
from core.models import RoleChoices


def merge_duplicate_user_accounts(apps, schema_editor):
    """Merge user accounts that share the same email address.

    Historical Context:
    Previously, ProConnect authentication could return users with the same email
    but different sub, leading to duplicate user accounts. While the application
    now prevents this scenario, this migration is needed to clean up existing
    duplicate accounts to ensure users can continue to connect without being blocked
    by unique email constraints.

    Performance of this migration is poor, this implementation prioritizes readability
    and maintainability. Consider refactoring this code to avoid individual db queries
    on each iteration.
    """

    User = apps.get_model("core", "User")
    ResourceAccess = apps.get_model("core", "ResourceAccess")

    emails_with_duplicates = (
        User.objects.values("email")
        .annotate(count=Count("id"))
        .filter(count__gt=1)
        .values_list("email", flat=True)
    )

    for email in emails_with_duplicates:
        # Keep the oldest user
        primary_user = User.objects.filter(email=email).order_by("created_at").first()
        duplicate_user_accounts = User.objects.filter(email=email).exclude(
            id=primary_user.id
        )

        # Get IDs of duplicate accounts to be merged
        duplicate_account_ids = list(
            duplicate_user_accounts.values_list("id", flat=True)
        )
        resource_accesses_to_transfer = ResourceAccess.objects.filter(
            user_id__in=duplicate_account_ids
        )

        # Transfer resource access permissions to primary user
        # This process handles role hierarchy where:
        # OWNER > ADMIN > MEMBER
        for resource_access in resource_accesses_to_transfer:
            # Determine if primary user already has access to this resource
            existing_primary_access = ResourceAccess.objects.filter(
                user_id=primary_user.id, resource_id=resource_access.resource.id
            ).first()

            if existing_primary_access:
                # Skip if primary user is already OWNER as it's the highest privilege level
                # No need to modify or downgrade owner access
                if existing_primary_access.role == RoleChoices.OWNER:
                    continue

                # Skip if primary user already has the exact same role
                # No need to update when roles match
                elif existing_primary_access.role == resource_access.role:
                    continue

                # Skip if new role is MEMBER since user already has base access
                # All existing access includes at least MEMBER privileges
                elif resource_access.role == RoleChoices.MEMBER:
                    continue

                # Update the role only if it represents a higher privilege level
                # Preserves existing access record while updating the role
                existing_primary_access.role = resource_access.role
                existing_primary_access.save()
            else:
                # Transfer access to primary user
                resource_access.user_id = primary_user.id
                resource_access.save()

        # Delete duplicate accounts - CASCADE will automatically remove any untransferred
        # ResourceAccess records and other related data for these users
        duplicate_user_accounts.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0005_recording_recordingaccess_and_more"),
    ]

    operations = [
        migrations.RunPython(
            merge_duplicate_user_accounts, reverse_code=migrations.RunPython.noop
        ),
    ]
