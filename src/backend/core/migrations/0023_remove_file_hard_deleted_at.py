from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0022_user_default_room_access_level_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="file",
            name="hard_deleted_at",
        ),
    ]
