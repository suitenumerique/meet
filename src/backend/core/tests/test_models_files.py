"""
Unit tests for the File model deletion flow
"""

from io import BytesIO
from unittest import mock

from django.core.files.storage import default_storage
from django.utils import timezone

import pytest

from core.factories import FileFactory
from core.models import File

pytestmark = pytest.mark.django_db


def test_models_files_soft_delete():
    """Soft deleting should only set the deletion timestamp."""
    file = FileFactory()
    assert file.is_deleted is False

    file.soft_delete()

    file.refresh_from_db()
    assert file.is_deleted is True
    assert FileFactory(deleted_at=timezone.now()).is_deleted is True


def test_models_files_soft_delete_twice():
    """Soft deleting an already soft deleted file should fail."""
    file = FileFactory()
    file.soft_delete()

    with pytest.raises(RuntimeError, match="already deleted"):
        file.soft_delete()


def test_models_files_delete():
    """Deleting should remove the row and both the final and temporary objects."""
    file = FileFactory(upload_bytes=b"hello")
    default_storage.save(file.temporary_file_key, BytesIO(b"hello"))
    # Captured up front: Django nulls the pk after delete, and the keys depend on it
    pk, key, temporary_key = file.pk, file.file_key, file.temporary_file_key

    file.delete()

    assert not File.objects.filter(pk=pk).exists()
    assert not default_storage.exists(key)
    assert not default_storage.exists(temporary_key)


def test_models_files_delete_without_storage_object():
    """Deleting a file that has nothing in storage should still remove the row."""
    file = FileFactory()
    pk = file.pk

    file.delete()

    assert not File.objects.filter(pk=pk).exists()


def test_models_files_delete_storage_failure_keeps_row():
    """A storage failure must leave the row in place so the deletion can be retried."""
    file = FileFactory(upload_bytes=b"hello")

    with (
        mock.patch.object(default_storage, "delete", side_effect=OSError("boom")),
        pytest.raises(OSError, match="boom"),
    ):
        file.delete()

    assert File.objects.filter(pk=file.pk).exists()
    assert default_storage.exists(file.file_key)
