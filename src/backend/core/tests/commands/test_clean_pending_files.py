"""Tests for the clean_pending_files management command."""

from datetime import timedelta

from django.core.files.storage import default_storage
from django.core.management import call_command
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
        upload_bytes=b"hello",
    )

    call_command("clean_pending_files")

    file.refresh_from_db()
    assert file.deleted_at is None
    assert default_storage.exists(file.file_key)


def test_clean_pending_files_old_pending_deleted():
    """Pending files older than the threshold should be deleted."""
    old_date = timezone.now() - timedelta(hours=49)
    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.PENDING,
        upload_bytes=b"hello",
    )
    assert default_storage.exists(file.file_key)
    models.File.objects.filter(pk=file.pk).update(created_at=old_date)

    call_command("clean_pending_files")

    assert not models.File.objects.filter(pk=file.pk).exists()
    assert not default_storage.exists(file.file_key)


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
    assert file.hard_deleted_at is None


def test_clean_pending_files_custom_hours():
    """The --hours argument controls the age threshold."""
    old_date = timezone.now() - timedelta(hours=10)
    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.PENDING,
        upload_bytes=b"hello",
    )
    models.File.objects.filter(pk=file.pk).update(created_at=old_date)

    # Default 24h threshold -> file not deleted
    call_command("clean_pending_files")

    file.refresh_from_db()
    assert file.deleted_at is None
    assert default_storage.exists(file.file_key)

    # 8h threshold -> file deleted
    call_command("clean_pending_files", "--hours=8")

    assert not models.File.objects.filter(pk=file.pk).exists()
    assert not default_storage.exists(file.file_key)
