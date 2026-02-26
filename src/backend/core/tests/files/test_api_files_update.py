"""
Tests for files API endpoint in meet's core app: update
"""

import pytest
from rest_framework.test import APIClient

from core import factories
from core.api import serializers

pytestmark = pytest.mark.django_db


def test_api_files_update_anonymous_forbidden():
    """
    Anonymous users should not be allowed to update an file when link
    configuration does not allow it.
    """

    file = factories.FileFactory()

    old_file_values = serializers.FileSerializer(instance=file).data
    new_file_values = serializers.FileSerializer(instance=factories.FileFactory()).data

    response = APIClient().put(
        f"/api/v1.0/files/{file.id!s}/",
        new_file_values,
        format="json",
    )
    assert response.status_code == 401
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }

    file.refresh_from_db()
    item_values = serializers.FileSerializer(instance=file).data
    assert item_values == old_file_values


def test_api_files_update_description_and_title():
    """
    Test the description and title of an file can be updated.
    """
    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory(
        description="Old description",
        title="Old title",
        creator=user,
    )

    response = client.patch(
        f"/api/v1.0/files/{file.id!s}/",
        {"description": "New description", "title": "New title"},
        format="json",
    )
    assert response.status_code == 200
    result = response.json()
    assert result["description"] == "New description"
    assert result["title"] == "New title"

    file.refresh_from_db()
    assert file.description == "New description"
    assert file.title == "New title"
