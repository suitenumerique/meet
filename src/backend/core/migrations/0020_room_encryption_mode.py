"""Replace encryption_enabled boolean with encryption_mode enum."""

from django.db import migrations, models


def migrate_encryption_enabled_to_mode(apps, schema_editor):
    """Convert existing encryption_enabled=True rooms to encryption_mode='basic'."""
    Room = apps.get_model("core", "Room")
    Room.objects.filter(encryption_enabled=True).update(encryption_mode="basic")


def migrate_mode_to_encryption_enabled(apps, schema_editor):
    """Reverse: set encryption_enabled=True for any non-'none' encryption_mode."""
    Room = apps.get_model("core", "Room")
    Room.objects.exclude(encryption_mode="none").update(encryption_enabled=True)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0019_room_encryption_enabled"),
    ]

    operations = [
        # 1. Add the new encryption_mode field
        migrations.AddField(
            model_name="room",
            name="encryption_mode",
            field=models.CharField(
                choices=[
                    ("none", "No encryption"),
                    ("basic", "Basic encryption"),
                    ("advanced", "Advanced encryption"),
                ],
                default="none",
                help_text="End-to-end encryption mode for this room.",
                max_length=20,
                verbose_name="Encryption mode",
            ),
        ),
        # 2. Migrate existing data
        migrations.RunPython(
            migrate_encryption_enabled_to_mode,
            migrate_mode_to_encryption_enabled,
        ),
        # 3. Remove the old boolean field
        migrations.RemoveField(
            model_name="room",
            name="encryption_enabled",
        ),
    ]
