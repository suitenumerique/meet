"""
Test the frontend configuration endpoint.
"""

from rest_framework.test import APIClient


def test_api_config_is_public():
    """The configuration is readable without authentication."""
    response = APIClient().get("/api/v1.0/config/")

    assert response.status_code == 200


def test_api_config_chat_media_defaults():
    """Chat media is advertised with its default limits and enabled by default."""
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
        "allowed_extensions": [".jpg", ".jpeg", ".png", ".webp", ".gif"],
    }


def test_api_config_chat_media_excludes_svg():
    """SVG is never advertised, it can execute script once rendered."""
    response = APIClient().get("/api/v1.0/config/")

    chat_media = response.json()["chat_media"]

    assert "image/svg+xml" not in chat_media["allowed_mimetypes"]
    assert ".svg" not in chat_media["allowed_extensions"]


def test_api_config_chat_media_disabled(settings):
    """An operator can turn chat media off."""
    settings.CHAT_MEDIA_ENABLED = False

    response = APIClient().get("/api/v1.0/config/")

    assert response.json()["chat_media"]["enabled"] is False


def test_api_config_chat_media_overrides(settings):
    """Limits and allowlists are reported from settings, not hardcoded."""
    settings.CHAT_MEDIA_MAX_SIZE = 1024
    settings.CHAT_MEDIA_ALLOWED_MIMETYPES = ["image/png"]
    settings.CHAT_MEDIA_ALLOWED_EXTENSIONS = [".png"]

    response = APIClient().get("/api/v1.0/config/")

    assert response.json()["chat_media"] == {
        "enabled": True,
        "max_size": 1024,
        "allowed_mimetypes": ["image/png"],
        "allowed_extensions": [".png"],
    }
