"""
Test rooms API endpoints in the Meet core app: delete.
"""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import Room
from ...services.room_management import RoomManagement, RoomNotFoundException

pytestmark = pytest.mark.django_db


def test_api_rooms_delete_anonymous():
    """Anonymous users should not be allowed to destroy a room."""
    room = RoomFactory()
    client = APIClient()

    response = client.delete(
        f"/api/v1.0/rooms/{room.id!s}/",
    )

    assert response.status_code == 401
    assert Room.objects.count() == 1


def test_api_rooms_delete_authenticated():
    """
    Authenticated users should not be allowed to delete a room to which they are not
    related.
    """
    room = RoomFactory()
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/rooms/{room.id!s}/",
    )

    assert response.status_code == 403
    assert Room.objects.count() == 1


def test_api_rooms_delete_members():
    """
    Authenticated users should not be allowed to delete a room for which they are
    only a member.
    """
    user = UserFactory()
    room = RoomFactory(
        users=[(user, "member")]
    )  # as user declared in the room but not administrator

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/rooms/{room.id}/",
    )

    assert response.status_code == 403
    assert Room.objects.count() == 1


def test_api_rooms_delete_administrators():
    """
    Authenticated users should not be allowed to delete a room for which they are
    administrator.
    """
    user = UserFactory()
    room = RoomFactory(users=[(user, "administrator")])

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/rooms/{room.id}/",
    )

    assert response.status_code == 403
    assert Room.objects.count() == 1


def test_api_rooms_delete_owners():
    """
    Authenticated users should be able to delete a room for which they are directly
    owner.
    """
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/rooms/{room.id}/",
    )

    assert response.status_code == 204
    assert Room.objects.exists() is False


@mock.patch.object(
    RoomManagement,
    "delete_room",
    side_effect=RoomNotFoundException("Room does not exist"),
)
def test_api_rooms_delete_owners_room_not_live(mock_delete_room):
    """
    Deleting a room that is not live in LiveKit should still soft delete it.
    """
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/rooms/{room.id}/",
    )

    assert response.status_code == 204
    mock_delete_room.assert_called_once_with(str(room.id))
    assert Room.objects.exists() is False
    assert Room.all_objects.get(id=room.id).deleted_at is not None
