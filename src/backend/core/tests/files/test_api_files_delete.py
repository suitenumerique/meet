"""
Tests for files API endpoint in meet's core app: delete
"""

import pytest
from rest_framework.test import APIClient

from core import factories, models

pytestmark = pytest.mark.django_db


def test_api_files_delete_anonymous():
    """Anonymous users should not be allowed to destroy a file."""
    file = factories.FileFactory()
    existing_items = models.File.objects.all().count()

    response = APIClient().delete(
        f"/api/v1.0/files/{file.id!s}/",
    )

    assert response.status_code == 401
    assert models.File.objects.count() == existing_items


def test_api_files_delete_authenticated_owner():
    """
    Authenticated users should be able to delete a item they own.
    """
    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory(creator=user)

    response = client.delete(
        f"/api/v1.0/files/{file.id}/",
    )

    assert response.status_code == 204

    # Make sure it is only a soft delete
    file.refresh_from_db()
    assert file.deleted_at is not None
