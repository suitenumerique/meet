"""Add encrypted_symmetric_key to ResourceAccess for advanced E2EE mode."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0020_room_encryption_mode"),
    ]

    operations = [
        migrations.AddField(
            model_name="resourceaccess",
            name="encrypted_symmetric_key",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Vault-wrapped symmetric encryption key for advanced E2EE mode. Each user's copy is encrypted for their own vault public key.",
                verbose_name="Encrypted symmetric key",
            ),
        ),
    ]
