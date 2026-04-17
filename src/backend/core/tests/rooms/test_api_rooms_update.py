"""
Test rooms API endpoints in the Meet core app: update.
"""

import random

import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import RoomAccessLevel

pytestmark = pytest.mark.django_db


def test_api_rooms_update_anonymous():
    """Anonymous users should not be allowed to update a room."""
    room = RoomFactory(name="Old name")
    client = APIClient()

    response = client.put(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "name": "New name",
        },
    )
    assert response.status_code == 401
    room.refresh_from_db()
    assert room.name == "Old name"
    assert room.slug == "old-name"


def test_api_rooms_update_authenticated():
    """Authenticated users should not be allowed to update a room."""
    user = UserFactory()
    room = RoomFactory(name="Old name")
    client = APIClient()
    client.force_login(user)

    response = client.put(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "name": "New name",
        },
    )
    assert response.status_code == 403
    room.refresh_from_db()
    assert room.name == "Old name"
    assert room.slug == "old-name"


def test_api_rooms_update_members():
    """
    Users who are members of a room but not administrators should
    not be allowed to update it.
    """
    user = UserFactory()
    room = RoomFactory(
        access_level=RoomAccessLevel.PUBLIC, name="Old name", users=[(user, "member")]
    )
    client = APIClient()
    client.force_login(user)

    response = client.put(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "name": "New name",
            "slug": "should-be-ignored",
            "access_level": RoomAccessLevel.RESTRICTED,
            "configuration": {"can_publish_sources": ["camera", "microphone"]},
        },
        format="json",
    )
    assert response.status_code, 403
    room.refresh_from_db()
    assert room.name == "Old name"
    assert room.slug == "old-name"
    assert room.access_level != RoomAccessLevel.RESTRICTED
    assert room.configuration == {}


def test_api_rooms_update_administrators():
    """Administrators or owners of a room should be allowed to update it."""
    user = UserFactory()
    room = RoomFactory(
        access_level=RoomAccessLevel.RESTRICTED,
        users=[(user, random.choice(["administrator", "owner"]))],
    )
    client = APIClient()
    client.force_login(user)

    response = client.put(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "name": "New name",
            "slug": "should-be-ignored",
            "access_level": RoomAccessLevel.PUBLIC,
            "configuration": {"can_publish_sources": ["camera", "microphone"]},
        },
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.name == "New name"
    assert room.slug == "new-name"
    assert room.access_level == RoomAccessLevel.PUBLIC
    assert room.configuration == {"can_publish_sources": ["camera", "microphone"]}


@pytest.mark.parametrize(
    "configuration",
    [
        {},
        {"can_publish_sources": ["camera", "microphone"]},
        {
            "can_publish_sources": [
                "camera",
                "microphone",
                "screen_share",
                "screen_share_audio",
            ]
        },
        {"can_publish_sources": []},
        {"can_publish_sources": None},
    ],
)
def test_api_rooms_update_configuration_valid(configuration):
    """Administrators should be allowed to set valid configurations."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"configuration": configuration},
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.configuration == configuration


def test_api_rooms_update_configuration_extra_keys_rejected():
    """Extra keys in configuration should be rejected."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "configuration": {
                "can_publish_sources": ["camera"],
                "arbitrary_key": "value",
            }
        },
        format="json",
    )
    assert response.status_code == 400
    room.refresh_from_db()
    assert room.configuration == {}


@pytest.mark.parametrize("invalid_source", ["invalid_source", "CAMERA"])
def test_api_rooms_update_configuration_invalid_source_value(invalid_source):
    """Invalid source values should be rejected."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"configuration": {"can_publish_sources": [invalid_source]}},
        format="json",
    )
    assert response.status_code == 400
    room.refresh_from_db()
    assert room.configuration == {}


def test_api_rooms_update_configuration_wrong_type():
    """Configuration values with wrong types should be rejected."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"configuration": {"can_publish_sources": "camera"}},
        format="json",
    )
    assert response.status_code == 400
    room.refresh_from_db()
    assert room.configuration == {}


def test_api_rooms_update_administrators_of_another():
    """
    Being administrator or owner of a room should not grant authorization to update
    another room.
    """
    user = UserFactory()
    RoomFactory(users=[(user, random.choice(["administrator", "owner"]))])
    other_room = RoomFactory(name="Old name")
    client = APIClient()
    client.force_login(user)

    response = client.put(
        f"/api/v1.0/rooms/{other_room.id!s}/",
        {"name": "New name", "slug": "should-be-ignored"},
    )
    assert response.status_code, 403
    other_room.refresh_from_db()
    assert other_room.name == "Old name"
    assert other_room.slug == "old-name"
