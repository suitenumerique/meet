"""Store user emails stripped and ASCII-lowercased, and blank ones as NULL."""

import string

from django.db import migrations

BATCH_SIZE = 500

_ASCII_LOWERCASE_TABLE = str.maketrans(string.ascii_uppercase, string.ascii_lowercase)


def normalize_email(email):
    """Strip an email and lowercase its ASCII letters only."""
    return (email or "").strip().translate(_ASCII_LOWERCASE_TABLE)


def forwards(apps, schema_editor):
    """Normalize the user emails, writing the changed rows in batches."""
    User = apps.get_model("core", "User")
    batch = []
    for user_id, email in User.objects.values_list("id", "email").iterator(
        chunk_size=BATCH_SIZE
    ):
        normalized = normalize_email(email) or None
        if normalized == email:
            continue
        batch.append(User(id=user_id, email=normalized))
        if len(batch) == BATCH_SIZE:
            User.objects.bulk_update(batch, ["email"])
            batch = []
    if batch:
        User.objects.bulk_update(batch, ["email"])


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("core", "0029_alter_application_client_secret_sha256"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop, elidable=True),
    ]
