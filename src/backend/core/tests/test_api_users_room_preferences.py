"""
Test the default room preferences exposed on the users API.
"""

import pytest
from rest_framework.test import APIClient

from core import factories

pytestmark = pytest.mark.django_db


def test_api_users_me_includes_default_room_preferences():
    """The "me" endpoint should expose the user's default room preferences."""
    user = factories.UserFactory(
        default_room_access_level="restricted",
        default_room_configuration={"everyone_can_mute": False},
    )

    client = APIClient()
    client.force_login(user)

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 200
    content = response.json()
    assert content["default_room_access_level"] == "restricted"
    assert content["default_room_configuration"] == {"everyone_can_mute": False}


def test_api_users_update_default_room_preferences():
    """Users should be able to update their own default room preferences."""
    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/users/{user.id!s}/",
        {
            "default_room_access_level": "trusted",
            "default_room_configuration": {
                "can_publish_sources": ["microphone", "camera"],
                "everyone_can_mute": False,
            },
        },
        format="json",
    )

    assert response.status_code == 200
    user.refresh_from_db()
    assert user.default_room_access_level == "trusted"
    assert user.default_room_configuration == {
        "can_publish_sources": ["microphone", "camera"],
        "everyone_can_mute": False,
    }


def test_api_users_update_default_room_access_level_invalid():
    """An invalid access level should be rejected."""
    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/users/{user.id!s}/",
        {"default_room_access_level": "invalid"},
        format="json",
    )

    assert response.status_code == 400
    user.refresh_from_db()
    assert user.default_room_access_level is None


def test_api_users_update_default_room_configuration_invalid():
    """An invalid room configuration should be rejected."""
    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/users/{user.id!s}/",
        {"default_room_configuration": {"unknown_field": True}},
        format="json",
    )

    assert response.status_code == 400
    user.refresh_from_db()
    assert user.default_room_configuration == {}


def test_api_users_update_other_user_default_room_preferences_forbidden():
    """Users should not be able to update someone else's preferences."""
    user = factories.UserFactory()
    other_user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/users/{other_user.id!s}/",
        {"default_room_access_level": "restricted"},
        format="json",
    )

    assert response.status_code == 403
    other_user.refresh_from_db()
    assert other_user.default_room_access_level is None


def test_api_users_me_drops_a_default_the_instance_forbids(settings):
    """The row keeps the level the user chose, and the endpoint answers with none."""
    settings.ALLOW_PUBLIC_ROOMS = False
    user = factories.UserFactory(default_room_access_level="public")

    client = APIClient()
    client.force_login(user)

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 200
    assert response.json()["default_room_access_level"] is None
    user.refresh_from_db()
    assert user.default_room_access_level == "public"
