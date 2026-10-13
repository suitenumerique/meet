"""
Test rooms API endpoints in the Meet core app: capacity.
"""

# pylint: disable=redefined-outer-name

from unittest import mock

from django.contrib.auth.models import AnonymousUser
from django.urls import reverse

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from core import utils
from core.factories import RoomFactory
from core.services.room_management import RoomManagement, RoomManagementException

pytestmark = pytest.mark.django_db


@pytest.fixture
def room():
    """Create a room."""
    return RoomFactory()


def _get_capacity(room, token_room=None):
    """Ask for the room's capacity with a LiveKit token for `token_room`."""
    headers = {}
    if token_room:
        token = utils.generate_token(room=str(token_room.id), user=AnonymousUser())
        headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    url = reverse("rooms-capacity", kwargs={"pk": room.id})
    return APIClient().get(url, **headers)


@pytest.mark.parametrize("is_full", [True, False])
@mock.patch.object(RoomManagement, "is_full")
def test_api_rooms_capacity(mock_is_full, room, is_full):
    """A participant holding a token for the room learns whether it is full."""
    mock_is_full.return_value = is_full

    response = _get_capacity(room, room)

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"is_full": is_full}
    mock_is_full.assert_called_once_with(str(room.id))


@mock.patch.object(RoomManagement, "is_full")
def test_api_rooms_capacity_without_token(mock_is_full, room):
    """Without a LiveKit token, the room's capacity is not disclosed."""
    response = _get_capacity(room)

    assert response.status_code == status.HTTP_403_FORBIDDEN
    mock_is_full.assert_not_called()


@mock.patch.object(RoomManagement, "is_full")
def test_api_rooms_capacity_token_for_another_room(mock_is_full, room):
    """A token for another room does not disclose this room's capacity."""
    response = _get_capacity(room, RoomFactory())

    assert response.status_code == status.HTTP_403_FORBIDDEN
    mock_is_full.assert_not_called()


@mock.patch.object(RoomManagement, "is_full", side_effect=RoomManagementException)
def test_api_rooms_capacity_livekit_error(mock_is_full, room):
    """A failure reading the room answers 500."""
    response = _get_capacity(room, room)

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.json() == {"error": "Failed to read room capacity"}
    mock_is_full.assert_called_once_with(str(room.id))
