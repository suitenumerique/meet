"""
Unit tests for the File model deletion flow
"""

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


@pytest.mark.django_db(transaction=True)
def test_models_files_delete():
    """Deleting should remove the row and the content from storage."""
    file = FileFactory(upload_bytes=b"hello")
    key = file.file_key

    file.delete()

    assert not File.objects.filter(pk=file.pk).exists()
    assert not default_storage.exists(key)
