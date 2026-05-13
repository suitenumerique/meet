"""Add Room.encryption_mode and User.default_encryption_mode (enum-based).

We store the mode as an enum (CharField with choices) rather than a boolean
so a future "advanced" mode (per-user vault keys, etc.) can be added without
a schema migration.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0018_rename_active_application_is_active"),
    ]

    operations = [
        migrations.AddField(
            model_name="room",
            name="encryption_mode",
            field=models.CharField(
                choices=[
                    ("none", "No encryption"),
                    ("basic", "Passphrase-in-URL encryption"),
                ],
                default="none",
                help_text="End-to-end encryption mode for this room.",
                max_length=20,
                verbose_name="Encryption mode",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="default_encryption_mode",
            field=models.CharField(
                choices=[
                    ("none", "No encryption"),
                    ("basic", "Passphrase-in-URL encryption"),
                ],
                default="none",
                help_text="Encryption mode pre-selected when this user creates a new meeting.",
                max_length=20,
                verbose_name="Default encryption mode",
            ),
        ),
    ]
