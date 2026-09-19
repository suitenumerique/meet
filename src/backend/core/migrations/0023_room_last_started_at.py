from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_user_default_room_access_level_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='room',
            name='last_started_at',
            field=models.DateTimeField(blank=True, default=django.utils.timezone.now, editable=False, help_text='date and time at which the room was last started', null=True, verbose_name='last started at'),
            preserve_default=False,
        ),
    ]
