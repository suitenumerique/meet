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
            "configuration": {"the_key": "the_value"},
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
            "configuration": {"the_key": "the_value"},
        },
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.name == "New name"
    assert room.slug == "new-name"
    assert room.access_level == RoomAccessLevel.PUBLIC
    assert room.configuration == {"the_key": "the_value"}


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
