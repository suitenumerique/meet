"""
Test rooms API endpoints in the Meet core app: participants count.
"""

# pylint: disable=redefined-outer-name,unused-argument,no-name-in-module

import random
from unittest import mock

from django.test.utils import override_settings
from django.urls import reverse

import pytest
from livekit.api import TwirpError
from livekit.protocol.models import Room as LiveKitRoom
from livekit.protocol.room import ListRoomsResponse
from rest_framework import status
from rest_framework.test import APIClient

from core.factories import RoomFactory, UserFactory, UserResourceAccessFactory
from core.models import RoomAccessLevel

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_livekit_client():
    """Mock LiveKit API client, reporting two people in every room."""
    with mock.patch("core.utils.create_livekit_client") as mock_create:
        mock_client = mock.AsyncMock()
        mock_client.room.list_rooms.return_value = ListRoomsResponse(
            rooms=[LiveKitRoom(num_participants=2)]
        )
        mock_create.return_value = mock_client
        yield mock_client


def test_participants_count_anonymous_public_room(mock_livekit_client):
    """Anyone can read the count of a room anyone may enter."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().get(
        reverse("rooms-participants-count", kwargs={"pk": room.id})
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"count": 2}

    request = mock_livekit_client.room.list_rooms.call_args.args[0]
    assert list(request.names) == [str(room.id)]


def test_participants_count_by_slug(mock_livekit_client):
    """The room code in the address reaches the same count as the id."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().get(
        reverse("rooms-participants-count", kwargs={"pk": room.slug})
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"count": 2}


def test_participants_count_empty_meeting(mock_livekit_client):
    """A room LiveKit has never created reports nobody."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    mock_livekit_client.room.list_rooms.return_value = ListRoomsResponse(rooms=[])

    response = APIClient().get(
        reverse("rooms-participants-count", kwargs={"pk": room.id})
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"count": 0}


def test_participants_count_anonymous_trusted_room(mock_livekit_client):
    """Someone who would have to wait for approval is told nothing."""
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)

    response = APIClient().get(
        reverse("rooms-participants-count", kwargs={"pk": room.id})
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    mock_livekit_client.room.list_rooms.assert_not_called()


def test_participants_count_authenticated_trusted_room(mock_livekit_client):
    """A signed-in user walks into a trusted room, so they get the count."""
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    client = APIClient()
    client.force_authenticate(user=UserFactory())

    response = client.get(reverse("rooms-participants-count", kwargs={"pk": room.id}))

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"count": 2}


def test_participants_count_restricted_room_without_access(mock_livekit_client):
    """A restricted room tells a signed-in stranger nothing."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()
    client.force_authenticate(user=UserFactory())

    response = client.get(reverse("rooms-participants-count", kwargs={"pk": room.id}))

    assert response.status_code == status.HTTP_404_NOT_FOUND
    mock_livekit_client.room.list_rooms.assert_not_called()


def test_participants_count_restricted_room_with_access(mock_livekit_client):
    """An invited member of a restricted room gets the count."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room,
        user=user,
        role=random.choice(["member", "administrator", "owner"]),
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get(reverse("rooms-participants-count", kwargs={"pk": room.id}))

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"count": 2}


@override_settings(ALLOW_UNREGISTERED_ROOMS=True)
def test_participants_count_unregistered_room(mock_livekit_client):
    """An unregistered room is counted under the slug it is named by."""
    response = APIClient().get(
        reverse("rooms-participants-count", kwargs={"pk": "tst-room-dev"})
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"count": 2}

    request = mock_livekit_client.room.list_rooms.call_args.args[0]
    assert list(request.names) == ["tst-room-dev"]


@override_settings(ALLOW_UNREGISTERED_ROOMS=False)
def test_participants_count_unregistered_room_disabled(mock_livekit_client):
    """With unregistered rooms off, an unknown room stays unknown."""
    response = APIClient().get(
        reverse("rooms-participants-count", kwargs={"pk": "tst-room-dev"})
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    mock_livekit_client.room.list_rooms.assert_not_called()


def test_participants_count_livekit_unreachable(mock_livekit_client):
    """A media server that cannot answer gives 503, never a 500."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    mock_livekit_client.room.list_rooms.side_effect = TwirpError(
        "internal", "boom", status=500
    )

    response = APIClient().get(
        reverse("rooms-participants-count", kwargs={"pk": room.id})
    )

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
