from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0018_rename_active_application_is_active"),
    ]

    operations = [
        migrations.AddField(
            model_name="room",
            name="encryption_enabled",
            field=models.BooleanField(
                default=False,
                help_text="Whether end-to-end encryption is enabled for this room.",
                verbose_name="Encryption enabled",
            ),
        ),
    ]
