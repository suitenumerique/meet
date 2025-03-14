# Generated by Django 5.1.3 on 2024-12-02 13:23

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0008_user_full_name_user_short_name'),
    ]

    operations = [
        migrations.AlterField(
            model_name='recording',
            name='status',
            field=models.CharField(choices=[('initiated', 'Initiated'), ('active', 'Active'), ('stopped', 'Stopped'), ('saved', 'Saved'), ('aborted', 'Aborted'), ('failed_to_start', 'Failed to Start'), ('failed_to_stop', 'Failed to Stop'), ('notification_succeeded', 'Notification succeeded')], default='initiated', max_length=50),
        ),
    ]
