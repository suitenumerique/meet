"""
Test rooms API endpoints in the Meet core app: delete.
"""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...analytics import AnalyticsEvent
from ...factories import RoomFactory, UserFactory
from ...models import Room, RoomAccessLevel
from ...services.room_management import RoomManagement, RoomNotFoundException
from ...services.sip_management import SIPManagement

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


@mock.patch("core.api.viewsets.analytics.capture")
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
@mock.patch.object(RoomManagement, "delete_room")
def test_api_rooms_delete_owners(mock_delete_room, _, mock_capture):
    """
    Authenticated users should be able to delete a room for which they are directly
    owner. The room is soft deleted, its LiveKit room is closed and a ROOM_DELETED
    analytics event is emitted.
    """
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")], access_level=RoomAccessLevel.TRUSTED)

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/rooms/{room.id}/",
    )

    assert response.status_code == 204
    mock_delete_room.assert_called_once_with(str(room.id))
    assert Room.objects.exists() is False
    assert Room.all_objects.get(id=room.id).deleted_at is not None

    mock_capture.assert_called_once_with(
        user,
        AnalyticsEvent.ROOM_DELETED,
        {"room_id": str(room.pk), "access_level": RoomAccessLevel.TRUSTED},
    )


@mock.patch.object(SIPManagement, "delete_dispatch_rule")
@mock.patch.object(
    RoomManagement,
    "delete_room",
    side_effect=RoomNotFoundException("Room does not exist"),
)
def test_api_rooms_delete_owners_room_not_live(
    mock_delete_room, mock_delete_dispatch_rule, settings
):
    """
    Deleting a room that is not live in LiveKit should still soft delete it, and
    delete its SIP dispatch rule, as no room_finished webhook will.
    """
    settings.ROOM_TELEPHONY_ENABLED = True
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/rooms/{room.id}/",
    )

    assert response.status_code == 204
    mock_delete_room.assert_called_once_with(str(room.id))
    mock_delete_dispatch_rule.assert_called_once_with(room.id)
    assert Room.objects.exists() is False
    assert Room.all_objects.get(id=room.id).deleted_at is not None


@mock.patch.object(RoomManagement, "delete_room")
def test_api_rooms_delete_soft_deleted(mock_delete_room):
    """Deleting a room that is already soft deleted should return a 410."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    room.soft_delete()

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/rooms/{room.id}/",
    )

    assert response.status_code == 410
    assert response.json() == {"detail": "This room has been deleted."}
    mock_delete_room.assert_not_called()


@mock.patch.object(RoomManagement, "delete_room")
def test_api_rooms_delete_soft_deleted_not_owner(mock_delete_room):
    """
    Deleting a soft-deleted room as a non-owner should return a 403,
    not revealing that the room has been deleted.
    """
    user = UserFactory()
    room = RoomFactory(users=[(user, "administrator")])
    room.soft_delete()

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/rooms/{room.id}/",
    )

    assert response.status_code == 403
    mock_delete_room.assert_not_called()
