"""Tests for the configuration API endpoint."""

from django.test import override_settings

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("allow_unregistered_rooms", [True, False])
def test_api_config_exposes_allow_unregistered_rooms(allow_unregistered_rooms):
    """
    The frontend needs this flag to decide whether a signed-out visitor can be
    offered to start a meeting, so it must be mirrored in the configuration.
    """
    with override_settings(ALLOW_UNREGISTERED_ROOMS=allow_unregistered_rooms):
        response = APIClient().get("/api/v1.0/config/")

    assert response.status_code == 200
    assert response.json()["allow_unregistered_rooms"] is allow_unregistered_rooms
