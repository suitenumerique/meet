"""
Test rooms API endpoints in the Meet core app: participants.
"""

# pylint: disable=redefined-outer-name,unused-argument,no-name-in-module

import random
from unittest import mock

from django.core.cache import cache
from django.test.utils import override_settings
from django.urls import reverse

import pytest
from livekit.api import TwirpError
from livekit.protocol.models import ParticipantInfo
from livekit.protocol.room import ListParticipantsResponse
from rest_framework import status
from rest_framework.test import APIClient

from core.api.throttling import ParticipantsUserRateThrottle
from core.factories import RoomFactory, UserFactory, UserResourceAccessFactory
from core.models import RoomAccessLevel

pytestmark = pytest.mark.django_db

INSIDE = {"count": 2, "names": ["Zora", "Neel"]}


@pytest.fixture(autouse=True)
def local_cache(settings):
    """Give these tests a cache of their own.

    The suite runs under xdist and the session backend lives in the shared
    cache, so clearing that one logs out whatever is running in the other
    worker. This one is in this process and nobody else's.
    """
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "test_api_rooms_participants",
        }
    }
    cache.clear()


@pytest.fixture
def mock_livekit_client():
    """Mock LiveKit API client, reporting Zora and Neel in every room."""
    with mock.patch("core.utils.create_livekit_client") as mock_create:
        mock_client = mock.AsyncMock()
        mock_client.room.list_participants.return_value = ListParticipantsResponse(
            participants=[ParticipantInfo(name="Zora"), ParticipantInfo(name="Neel")]
        )
        mock_create.return_value = mock_client
        yield mock_client


@pytest.mark.parametrize(
    "access_level,sign_in,with_role,expected",
    [
        # Anyone may enter a public room, so anyone may read it.
        (RoomAccessLevel.PUBLIC, False, False, status.HTTP_200_OK),
        (RoomAccessLevel.PUBLIC, True, False, status.HTTP_200_OK),
        # A trusted room admits anyone signed in, and holds anyone else.
        (RoomAccessLevel.TRUSTED, True, False, status.HTTP_200_OK),
        (RoomAccessLevel.TRUSTED, False, False, status.HTTP_404_NOT_FOUND),
        # A restricted room admits the people invited to it.
        (RoomAccessLevel.RESTRICTED, True, True, status.HTTP_200_OK),
        (RoomAccessLevel.RESTRICTED, True, False, status.HTTP_404_NOT_FOUND),
        (RoomAccessLevel.RESTRICTED, False, False, status.HTTP_404_NOT_FOUND),
    ],
)
def test_participants_answers_whoever_the_room_would_admit(
    mock_livekit_client, access_level, sign_in, with_role, expected
):
    """Only someone the room would let in without approval is told who is inside."""
    room = RoomFactory(access_level=access_level)
    client = APIClient()

    if sign_in:
        user = UserFactory()
        if with_role:
            UserResourceAccessFactory(
                resource=room,
                user=user,
                role=random.choice(["member", "administrator", "owner"]),
            )
        client.force_authenticate(user=user)

    response = client.get(reverse("rooms-participants", kwargs={"pk": room.id}))

    assert response.status_code == expected

    if expected == status.HTTP_200_OK:
        assert response.json() == INSIDE
        request = mock_livekit_client.room.list_participants.call_args.args[0]
        assert request.room == str(room.id)
    else:
        mock_livekit_client.room.list_participants.assert_not_called()


def test_participants_by_slug(mock_livekit_client):
    """The room code in the address reaches the same answer as the id."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().get(reverse("rooms-participants", kwargs={"pk": room.slug}))

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == INSIDE


def test_participants_is_read_once_for_everyone_waiting(mock_livekit_client):
    """The join screen is polled, so the answer is held rather than asked twice."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    url = reverse("rooms-participants", kwargs={"pk": room.id})

    first = APIClient().get(url)
    second = APIClient().get(url)

    assert first.json() == second.json() == INSIDE
    assert mock_livekit_client.room.list_participants.call_count == 1


@override_settings(ROOM_PARTICIPANTS_CACHE_SECONDS=0)
def test_participants_cache_can_be_turned_off(mock_livekit_client):
    """A zero hold sends every request through to LiveKit."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    url = reverse("rooms-participants", kwargs={"pk": room.id})

    APIClient().get(url)
    APIClient().get(url)

    assert mock_livekit_client.room.list_participants.call_count == 2


def test_participants_of_two_rooms_are_held_apart(mock_livekit_client):
    """One meeting's answer is never served for another."""
    first = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    second = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    APIClient().get(reverse("rooms-participants", kwargs={"pk": first.id}))
    APIClient().get(reverse("rooms-participants", kwargs={"pk": second.id}))

    assert mock_livekit_client.room.list_participants.call_count == 2


@override_settings(ALLOW_UNREGISTERED_ROOMS=True)
def test_participants_unregistered_room(mock_livekit_client):
    """An unregistered room is read under the slug it is named by."""
    response = APIClient().get(
        reverse("rooms-participants", kwargs={"pk": "tst-room-dev"})
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == INSIDE

    request = mock_livekit_client.room.list_participants.call_args.args[0]
    assert request.room == "tst-room-dev"


@override_settings(ALLOW_UNREGISTERED_ROOMS=False)
def test_participants_unregistered_room_disabled(mock_livekit_client):
    """With unregistered rooms off, an unknown room stays unknown."""
    response = APIClient().get(
        reverse("rooms-participants", kwargs={"pk": "tst-room-dev"})
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    mock_livekit_client.room.list_participants.assert_not_called()


def test_participants_livekit_unreachable(mock_livekit_client):
    """A media server that cannot answer gives 503, never a 500, and is not
    asked again by everyone else waiting on the same meeting."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    mock_livekit_client.room.list_participants.side_effect = TwirpError(
        "internal", "boom", status=500
    )
    url = reverse("rooms-participants", kwargs={"pk": room.id})

    first = APIClient().get(url)
    second = APIClient().get(url)

    assert first.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert second.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert mock_livekit_client.room.list_participants.call_count == 1


def test_participants_anonymous_request_is_counted_once():
    """An anonymous poll must not spend two of its own allowance.

    Both throttles share a scope, and UserRateThrottle falls back to the IP
    address, so without the guard it builds the very key the anonymous throttle
    uses and every request counts twice.
    """
    request = mock.Mock()
    request.user.is_authenticated = False

    assert ParticipantsUserRateThrottle().get_cache_key(request, view=None) is None
