"""
Test the frontend configuration endpoint.
"""

from rest_framework.test import APIClient


def test_api_config_chat_media_defaults():
    """
    Chat media is advertised without authentication, enabled, with its default
    limits. SVG is never among them, since it can execute script once rendered.
    """
    response = APIClient().get("/api/v1.0/config/")

    assert response.status_code == 200
    assert response.json()["chat_media"] == {
        "enabled": True,
        "max_size": 5 * 1024 * 1024,
        "allowed_mimetypes": [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
        ],
    }


def test_api_config_chat_media_disabled(settings):
    """An operator can turn chat media off."""
    settings.CHAT_MEDIA_ENABLED = False

    response = APIClient().get("/api/v1.0/config/")

    assert response.json()["chat_media"]["enabled"] is False


def test_api_config_chat_media_overrides(settings):
    """Limits and allowlists are reported from settings, not hardcoded."""
    settings.CHAT_MEDIA_MAX_SIZE = 1024
    settings.CHAT_MEDIA_ALLOWED_MIMETYPES = ["image/png"]

    response = APIClient().get("/api/v1.0/config/")

    assert response.json()["chat_media"] == {
        "enabled": True,
        "max_size": 1024,
        "allowed_mimetypes": ["image/png"],
    }
