"""Tests for the purge_deleted_files management command."""

from datetime import timedelta
from io import StringIO
from random import randint
from unittest.mock import patch

from django.core.files.storage import default_storage
from django.core.management import CommandError, call_command
from django.utils import timezone

import pytest

from core import factories, models

pytestmark = pytest.mark.django_db


def test_purge_deleted_files_no_deleted_files(django_assert_num_queries):
    """Nothing happens when there are no purgeable files."""
    with django_assert_num_queries(1):
        call_command("purge_deleted_files")


@pytest.mark.django_db(transaction=True)
def test_purge_deleted_files_success(settings):
    """Only soft deleted files past the grace period are purged."""
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

    call_command("purge_deleted_files", stdout=out)

    assert "Purged 1 deleted file(s)." in out.getvalue()

    assert models.File.objects.filter(id=not_deleted_file.id).exists()
    assert models.File.objects.filter(id=not_purgeable_file.id).exists()
    assert not models.File.objects.filter(id=purgeable_file.id).exists()

    assert default_storage.exists(not_deleted_file.file_key)
    assert default_storage.exists(not_purgeable_file.file_key)
    assert not default_storage.exists(purgeable_file.file_key)


@pytest.mark.django_db(transaction=True)
def test_purge_deleted_files_storage_failure_keeps_row_and_continues(settings):
    """
    A storage failure on one file leaves its row in place for the next run,
    does not stop the other files from being purged, and exits non-zero.
    """
    out = StringIO()
    err = StringIO()

    settings.FILE_PURGE_GRACE_DAYS = 1
    purge_now = timezone.now() - timedelta(days=2)

    with patch("django.utils.timezone.now", return_value=purge_now):
        failing_file = factories.FileFactory(
            type=models.FileTypeChoices.BACKGROUND_IMAGE,
            upload_bytes=b"hello",
        )
        failing_file.soft_delete()
        purgeable_file = factories.FileFactory(
            type=models.FileTypeChoices.BACKGROUND_IMAGE,
            upload_bytes=b"hello",
        )
        purgeable_file.soft_delete()

    original_delete = default_storage.delete

    def flaky_delete(name):
        if name == failing_file.file_key:
            raise OSError("boom")
        return original_delete(name)

    with (
        patch.object(default_storage, "delete", side_effect=flaky_delete),
        pytest.raises(CommandError, match="Failed to purge 1 file"),
    ):
        call_command("purge_deleted_files", stdout=out, stderr=err)

    assert "Purged 1 deleted file(s)." in out.getvalue()
    assert f"Failed to purge file '{failing_file.pk}': boom" in err.getvalue()

    # The failing file is retried on the next run
    assert models.File.objects.filter(id=failing_file.id).exists()
    assert default_storage.exists(failing_file.file_key)

    # The other file was purged despite the earlier failure
    assert not models.File.objects.filter(id=purgeable_file.id).exists()
    assert not default_storage.exists(purgeable_file.file_key)
