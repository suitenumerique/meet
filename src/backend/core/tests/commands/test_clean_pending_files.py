"""Tests for the clean_pending_files management command."""

from datetime import timedelta
from io import BytesIO, StringIO
from unittest.mock import patch

from django.core.files.storage import default_storage
from django.core.management import CommandError, call_command
from django.utils import timezone

import pytest

from core import factories, models

pytestmark = pytest.mark.django_db


def test_clean_pending_files_no_stale_files():
    """Nothing happens when there are no stale pending files."""
    call_command("clean_pending_files")


def test_clean_pending_files_recent_pending_not_deleted():
    """Recent pending files (within threshold) should not be deleted."""
    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.PENDING,
    )
    # A pending upload only lives under the temporary key
    default_storage.save(file.temporary_file_key, BytesIO(b"hello"))

    call_command("clean_pending_files")

    file.refresh_from_db()
    assert file.deleted_at is None
    assert default_storage.exists(file.temporary_file_key)


def test_clean_pending_files_old_pending_deleted():
    """Pending files older than the threshold should be deleted, temporary object included."""
    old_date = timezone.now() - timedelta(hours=49)
    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.PENDING,
    )
    # A pending upload only lives under the temporary key
    default_storage.save(file.temporary_file_key, BytesIO(b"hello"))
    models.File.objects.filter(pk=file.pk).update(created_at=old_date)

    call_command("clean_pending_files")

    assert not models.File.objects.filter(pk=file.pk).exists()
    assert not default_storage.exists(file.temporary_file_key)


def test_clean_pending_files_old_non_pending_not_deleted():
    """Old files that are not pending should not be deleted."""
    old_date = timezone.now() - timedelta(hours=49)
    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.READY,
    )
    models.File.objects.filter(pk=file.pk).update(created_at=old_date)

    call_command("clean_pending_files")

    file.refresh_from_db()
    assert file.deleted_at is None


def test_clean_pending_files_custom_hours():
    """The --hours argument controls the age threshold."""
    old_date = timezone.now() - timedelta(hours=10)
    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.PENDING,
    )
    default_storage.save(file.temporary_file_key, BytesIO(b"hello"))
    models.File.objects.filter(pk=file.pk).update(created_at=old_date)

    # Default 24h threshold -> file not deleted
    call_command("clean_pending_files")

    file.refresh_from_db()
    assert file.deleted_at is None
    assert default_storage.exists(file.temporary_file_key)

    # 8h threshold -> file deleted
    call_command("clean_pending_files", "--hours=8")

    assert not models.File.objects.filter(pk=file.pk).exists()
    assert not default_storage.exists(file.temporary_file_key)


def test_clean_pending_files_storage_failure_keeps_row_and_continues():
    """
    A storage failure on one file leaves its row in place for the next run,
    does not stop the other files from being cleaned, and exits non-zero.
    """
    out = StringIO()
    err = StringIO()
    old_date = timezone.now() - timedelta(hours=49)

    failing_file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.PENDING,
    )
    default_storage.save(failing_file.temporary_file_key, BytesIO(b"hello"))
    stale_file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.PENDING,
    )
    default_storage.save(stale_file.temporary_file_key, BytesIO(b"hello"))
    models.File.objects.filter(pk__in=[failing_file.pk, stale_file.pk]).update(
        created_at=old_date
    )

    original_delete = default_storage.delete

    def flaky_delete(name):
        if name == failing_file.temporary_file_key:
            raise OSError("boom")
        return original_delete(name)

    with (
        patch.object(default_storage, "delete", side_effect=flaky_delete),
        pytest.raises(CommandError, match="Failed to clean 1 file"),
    ):
        call_command("clean_pending_files", stdout=out, stderr=err)

    assert "Cleaned 1 stale pending file(s)." in out.getvalue()
    assert f"Failed to clean file '{failing_file.pk}': boom" in err.getvalue()

    # The failing file is retried on the next run
    assert models.File.objects.filter(pk=failing_file.pk).exists()
    assert default_storage.exists(failing_file.temporary_file_key)

    # The other file was cleaned despite the earlier failure
    assert not models.File.objects.filter(pk=stale_file.pk).exists()
    assert not default_storage.exists(stale_file.temporary_file_key)
