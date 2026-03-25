"""
Tests for files API endpoint in meet's core app: list
"""

from unittest import mock

from django.utils import timezone

import pytest
from faker import Faker
from rest_framework.pagination import PageNumberPagination
from rest_framework.test import APIClient

from core import factories, models

fake = Faker()
pytestmark = pytest.mark.django_db


def test_api_files_list_anonymous_not_allowed():
    """
    Anonymous users should not be allowed to list files whatever the
    """
    response = APIClient().get("/api/v1.0/files/")
    assert response.status_code == 401


def test_api_files_list_authentificated_user_allowed():
    """
    Authentificated users should be allowed to list files
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.get("/api/v1.0/files/")
    assert response.status_code == 200
    assert response.data == {"count": 0, "next": None, "previous": None, "results": []}


def test_api_files_list_format():
    """Validate the format of files as returned by the list view."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        title="item 1",
        creator=user,
    )

    # A file from another user should not appear
    factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        title="item 2",
    )

    # hard deleted item should not appear
    factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        hard_deleted_at=timezone.now(),
        title="hard deleted item",
        creator=user,
    )

    response = client.get("/api/v1.0/files/")

    assert response.status_code == 200
    content = response.json()
    results = content.pop("results")
    assert content == {
        "count": 1,
        "next": None,
        "previous": None,
    }
    assert len(results) == 1
    assert results == [
        {
            "id": str(file.id),
            "created_at": file.created_at.isoformat().replace("+00:00", "Z"),
            "creator": {
                "id": str(file.creator.id),
                "full_name": file.creator.full_name,
                "short_name": file.creator.short_name,
            },
            "title": file.title,
            "updated_at": file.updated_at.isoformat().replace("+00:00", "Z"),
            "type": models.FileTypeChoices.BACKGROUND_IMAGE,
            "upload_state": file.upload_state,
            "url": None,
            "mimetype": file.mimetype,
            "filename": file.filename,
            "size": None,
            "description": None,
            "deleted_at": None,
            "hard_deleted_at": None,
            "abilities": {
                "destroy": True,
                "hard_delete": True,
                "media_auth": True,
                "partial_update": True,
                "retrieve": True,
                "update": True,
                "upload_ended": True,
            },
        }
    ]


@mock.patch.object(PageNumberPagination, "get_page_size", return_value=2)
def test_api_files_list_pagination(
    _mock_page_size,
):
    """Pagination should work as expected."""
    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    file_ids = [
        str(file.id)
        for file in factories.FileFactory.create_batch(
            3,
            creator=user,
            type=models.FileTypeChoices.BACKGROUND_IMAGE,
        )
    ]
    # Get page 1
    response = client.get(
        "/api/v1.0/files/",
    )

    assert response.status_code == 200
    content = response.json()

    assert content["count"] == 3
    assert content["next"] == "http://testserver/api/v1.0/files/?page=2"
    assert content["previous"] is None

    assert len(content["results"]) == 2
    for item in content["results"]:
        file_ids.remove(item["id"])

    # Get page 2
    response = client.get(
        "/api/v1.0/files/?page=2",
    )

    assert response.status_code == 200
    content = response.json()

    assert content["count"] == 3
    assert content["next"] is None
    assert content["previous"] == "http://testserver/api/v1.0/files/"

    assert len(content["results"]) == 1
    for item in content["results"]:
        file_ids.remove(item["id"])
    assert file_ids == []
