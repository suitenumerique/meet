"""Test the LiveKit settings exposed by the config endpoint."""

import json

import pytest
from rest_framework.test import APIClient

from core.tests.utils import livekit_cluster_entry

pytestmark = pytest.mark.django_db


def test_api_config_retrieve_livekit_url(settings):
    """Without LIVEKIT_CLUSTERS, browsers connect to LIVEKIT_CONFIGURATION's URL."""
    response = APIClient().get("/api/v1.0/config/")

    assert response.status_code == 200
    assert response.json()["livekit"]["url"] == settings.LIVEKIT_CONFIGURATION["url"]


def test_api_config_retrieve_livekit_url_default_cluster(settings):
    """Browsers are given the URL of the default LiveKit cluster, not its API URL."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry("paris", api_url="http://livekit.paris.svc:7880"),
            livekit_cluster_entry("lyon"),
        ]
    )

    response = APIClient().get("/api/v1.0/config/")

    assert response.status_code == 200
    assert response.json()["livekit"]["url"] == "wss://paris.livekit.test"


def test_api_config_retrieve_livekit_reconnect_defaults():
    """Without any override, the frontend gets the default backoff."""
    response = APIClient().get("/api/v1.0/config/")

    assert response.status_code == 200
    assert response.json()["livekit"]["reconnect"] == {
        "backoff_enabled": True,
        "base_delay_ms": 1000,
        "max_delay_ms": 10000,
        "give_up_after_ms": 180000,
        "backoff_reset_ms": 120000,
    }


def test_api_config_retrieve_livekit_reconnect_settings(settings):
    """Each reconnection setting reaches the frontend unchanged."""
    settings.LIVEKIT_RECONNECT_BACKOFF_ENABLED = False
    settings.LIVEKIT_RECONNECT_BASE_DELAY_MS = 500
    settings.LIVEKIT_RECONNECT_MAX_DELAY_MS = 30000
    settings.LIVEKIT_RECONNECT_GIVE_UP_AFTER_MS = 600000
    settings.LIVEKIT_RECONNECT_BACKOFF_RESET_MS = 60000

    response = APIClient().get("/api/v1.0/config/")

    assert response.status_code == 200
    assert response.json()["livekit"]["reconnect"] == {
        "backoff_enabled": False,
        "base_delay_ms": 500,
        "max_delay_ms": 30000,
        "give_up_after_ms": 600000,
        "backoff_reset_ms": 60000,
    }
