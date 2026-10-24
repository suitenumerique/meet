"""Add a separate fast hash while preserving legacy credentials for rollback."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0024_room_last_started_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="application",
            name="client_secret_sha256",
            field=models.CharField(
                max_length=255, null=True, blank=True
            ),
        ),
    ]
