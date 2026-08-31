"""Test the frontend configuration endpoint of the Meet core app."""

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_api_config_publishes_the_public_rooms_setting(settings):
    """The frontend reads whether public rooms are allowed from the configuration."""
    settings.ALLOW_PUBLIC_ROOMS = False

    response = APIClient().get("/api/v1.0/config/")

    assert response.status_code == 200
    assert response.json()["resource"]["allow_public_rooms"] is False
