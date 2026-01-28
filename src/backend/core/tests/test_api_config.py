"""
Test config API endpoint in the Meet core app.
"""

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_config_exposes_recording_permissions(settings):
    """Config endpoint should expose recording permission levels."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "authenticated"
    settings.RECORDING_TRANSCRIPT_PERMISSION = "admin_owner"

    client = APIClient()
    response = client.get("/api/v1.0/config/")

    assert response.status_code == 200
    data = response.json()
    assert data["recording"]["screen_recording_permission"] == "authenticated"
    assert data["recording"]["transcript_permission"] == "admin_owner"


def test_config_recording_permissions_default_values(settings):
    """Config endpoint should return default permission values."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"
    settings.RECORDING_TRANSCRIPT_PERMISSION = "admin_owner"

    client = APIClient()
    response = client.get("/api/v1.0/config/")

    assert response.status_code == 200
    data = response.json()
    assert data["recording"]["screen_recording_permission"] == "admin_owner"
    assert data["recording"]["transcript_permission"] == "admin_owner"
