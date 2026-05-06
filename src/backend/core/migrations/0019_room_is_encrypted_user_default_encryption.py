"""Add Room.is_encrypted and User.default_encryption.

`is_encrypted` is a boolean for now because passphrase-in-URL is the only
supported mode. A future migration may turn it into a CharField/enum if a
local-keys (vault) mode is reintroduced.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0018_rename_active_application_is_active"),
    ]

    operations = [
        migrations.AddField(
            model_name="room",
            name="is_encrypted",
            field=models.BooleanField(
                default=False,
                help_text="Whether end-to-end encryption is enabled for this room.",
                verbose_name="Encryption enabled",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="default_encryption",
            field=models.BooleanField(
                default=False,
                help_text="Whether new meetings created by this user are end-to-end encrypted by default.",
                verbose_name="Default to end-to-end encryption",
            ),
        ),
    ]
