"""
Tests for files API endpoint in meet's core app: list
"""

import pytest
from faker import Faker
from rest_framework.test import APIClient

from core import factories, models

fake = Faker()
pytestmark = pytest.mark.django_db


# Filters: unknown field


def test_api_files_list_filter_unknown_field():
    """
    Trying to filter by an unknown field should do nothing.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    factories.FileFactory(type=models.FileTypeChoices.BACKGROUND_IMAGE)
    expected_ids = {
        str(file.id)
        for file in factories.FileFactory.create_batch(
            2, creator=user, type=models.FileTypeChoices.BACKGROUND_IMAGE
        )
    }

    response = client.get("/api/v1.0/files/?unknown=true")

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 2
    assert {result["id"] for result in results} == expected_ids


# Filters: is_creator_me


def test_api_files_list_filter_is_creator_me_true():
    """
    Authenticated users should be able to filter files they created.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    factories.FileFactory.create_batch(
        2, creator=user, type=models.FileTypeChoices.BACKGROUND_IMAGE
    )
    factories.FileFactory.create_batch(2, type=models.FileTypeChoices.BACKGROUND_IMAGE)

    response = client.get("/api/v1.0/files/?is_creator_me=true")

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 2

    # Ensure all results are created by the current user
    for result in results:
        assert result["creator"] == {
            "id": str(user.id),
            "full_name": user.full_name,
            "short_name": user.short_name,
        }


def test_api_files_list_filter_is_creator_me_invalid():
    """Filtering with an invalid `is_creator_me` value should do nothing."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    factories.FileFactory.create_batch(
        3, creator=user, type=models.FileTypeChoices.BACKGROUND_IMAGE
    )

    response = client.get("/api/v1.0/files/?is_creator_me=invalid")

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 3


# Filters: type


def test_api_files_list_filter_type_and_upload_status():
    """
    Authenticated users should be able to filter files by their type and upload status.

    This test will make more sense when other types are added to the API
    """

    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory(
        creator=user,
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.PENDING,
    )
    assert file.upload_state == models.FileUploadStateChoices.PENDING

    expected_files = factories.FileFactory.create_batch(
        2,
        creator=user,
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.READY,
    )
    expected_files_ids = {str(file.id) for file in expected_files}

    # Filter by type: background_image & upload state
    response = client.get("/api/v1.0/files/?type=background_image&upload_state=ready")

    assert response.status_code == 200
    assert response.json()["count"] == 2

    results = response.json()["results"]

    # Ensure all results are background images
    results_ids = {result["id"] for result in results}
    assert results_ids == expected_files_ids
    for result in results:
        assert result["type"] == models.FileTypeChoices.BACKGROUND_IMAGE
        assert result["upload_state"] == models.FileUploadStateChoices.READY

    # Second request without the upload_state filter, to check that all 3 show up
    response = client.get("/api/v1.0/files/?type=background_image")

    assert response.status_code == 200
    assert response.json()["count"] == 3

    results = response.json()["results"]

    # Ensure all results are background images
    results_ids = {result["id"] for result in results}
    assert results_ids == {str(file.id) for file in expected_files + [file]}
    for result in results:
        assert result["type"] == models.FileTypeChoices.BACKGROUND_IMAGE


def test_api_files_list_filter_is_deleted():
    """
    Authenticated users should be able to filter files by their deletion status.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    not_deleted_file = factories.FileFactory(creator=user)

    deleted_files = factories.FileFactory.create_batch(2, creator=user)
    for file in deleted_files:
        file.soft_delete()

    # No filters
    response_no_filters = client.get("/api/v1.0/files/")

    assert response_no_filters.status_code == 200
    assert response_no_filters.json()["count"] == 3

    results = response_no_filters.json()["results"]

    results_ids = {result["id"] for result in results}
    assert results_ids == {str(file.id) for file in [*deleted_files, not_deleted_file]}

    # Filters deleted
    response_filter_deleted = client.get("/api/v1.0/files/?is_deleted=true")

    assert response_filter_deleted.status_code == 200
    assert response_filter_deleted.json()["count"] == 2

    results = response_filter_deleted.json()["results"]

    results_ids = {result["id"] for result in results}
    assert results_ids == {str(file.id) for file in deleted_files}

    # Filters not deleted
    response_filter_not_deleted = client.get("/api/v1.0/files/?is_deleted=false")

    assert response_filter_not_deleted.status_code == 200
    assert response_filter_not_deleted.json()["count"] == 1

    results = response_filter_not_deleted.json()["results"]

    # Ensure all results are deleted
    results_ids = {result["id"] for result in results}
    assert results_ids == {str(file.id) for file in [not_deleted_file]}


def test_api_files_list_filter_unknown_type():
    """
    Filtering by an unknown type should return an empty list
    """

    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    factories.FileFactory.create_batch(3, creator=user)

    response = client.get("/api/v1.0/files/?type=unknown")

    assert response.status_code == 400
    assert response.json() == {
        "type": ["Select a valid choice. unknown is not one of the available choices."]
    }
