"""Tests for the purge_deleted_files management command."""

from datetime import timedelta
from io import StringIO
from random import randint
from unittest.mock import patch

from django.core.files.storage import default_storage
from django.core.management import call_command
from django.utils import timezone

import pytest

from core import factories, models
from core.tasks.file import process_file_deletion

pytestmark = pytest.mark.django_db


def test_purge_deleted_files_no_deleted_files(django_assert_num_queries):
    """Nothing happens when there are no purgeable files."""
    with django_assert_num_queries(1):
        call_command("purge_deleted_files")


@pytest.mark.django_db(transaction=True)
def test_purge_deleted_files_success(settings):
    """
    Queue deletion for:
    - hard-deleted files
    - soft-deleted files past retention period + grace period.
    """
    out = StringIO()

    settings.FILE_PURGE_GRACE_DAYS = grace = randint(1, 20)

    now = timezone.now()
    purge_now = now - timedelta(days=grace)

    not_deleted_file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        upload_bytes=b"hello",
    )

    with patch("django.utils.timezone.now", return_value=now):
        not_purgeable_file = factories.FileFactory(
            type=models.FileTypeChoices.BACKGROUND_IMAGE,
            upload_bytes=b"hello",
        )
        not_purgeable_file.soft_delete()

    with patch("django.utils.timezone.now", return_value=purge_now):
        purgeable_file = factories.FileFactory(
            type=models.FileTypeChoices.BACKGROUND_IMAGE,
            upload_bytes=b"hello",
        )
        purgeable_file.soft_delete()

    hard_deleted_file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        upload_bytes=b"hello",
    )
    hard_deleted_file.soft_delete()
    hard_deleted_file.hard_delete()

    with patch(
        "core.management.commands.purge_deleted_files.process_file_deletion.delay",
        side_effect=process_file_deletion,
    ) as mock_delay:
        call_command("purge_deleted_files", stdout=out)

    assert "Purged 2 deleted file(s)." in out.getvalue()
    assert mock_delay.call_count == 2
    called_ids = {call.args[0] for call in mock_delay.call_args_list}
    assert called_ids == {purgeable_file.id, hard_deleted_file.id}

    assert models.File.objects.filter(id=not_deleted_file.id).exists()
    assert models.File.objects.filter(id=not_purgeable_file.id).exists()
    assert not models.File.objects.filter(id=purgeable_file.id).exists()
    assert not models.File.objects.filter(id=hard_deleted_file.id).exists()

    assert default_storage.exists(not_deleted_file.file_key)
    assert default_storage.exists(not_purgeable_file.file_key)
    assert not default_storage.exists(purgeable_file.file_key)
    assert not default_storage.exists(hard_deleted_file.file_key)
