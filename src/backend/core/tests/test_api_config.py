"""Test the frontend configuration endpoint of the Meet core app."""

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_api_config_publishes_allowed_access_levels(settings):
    """The frontend reads the room access allow-list from the configuration."""
    settings.RESOURCE_ALLOWED_ACCESS_LEVELS = ["trusted", "restricted"]

    response = APIClient().get("/api/v1.0/config/")

    assert response.status_code == 200
    assert response.json()["resource"]["allowed_access_levels"] == [
        "trusted",
        "restricted",
    ]
