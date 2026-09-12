"""Add a separate fast hash while preserving legacy credentials for rollback."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0022_user_default_room_access_level_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="application",
            name="client_secret_sha256",
            field=models.CharField(
                max_length=255, null=True, blank=True, editable=False
            ),
        ),
    ]
