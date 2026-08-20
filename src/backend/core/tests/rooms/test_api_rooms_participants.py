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
from lasuite.drf.throttling import MonitoredScopedRateThrottle
from livekit.api import TwirpError
from livekit.protocol.models import ParticipantInfo
from livekit.protocol.room import ListParticipantsResponse
from rest_framework import status
from rest_framework.test import APIClient

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


@override_settings(ALLOW_UNREGISTERED_ROOMS=True)
@pytest.mark.parametrize(
    "spelling",
    ["_{id}", " {id}", "({id})", "_{hex}"],
)
def test_participants_refuses_a_room_id_spelled_as_a_name(mock_livekit_client, spelling):
    """A room meets in LiveKit under its id, and no spelling of that id gets in.

    Each of these misses the id lookup and the slug lookup, so it lands on the
    unregistered path, where the name it carries would be the private room's own.
    """
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    pk = spelling.format(id=str(room.id), hex=room.id.hex)

    response = APIClient().get(f"/api/v1.0/rooms/{pk}/participants/")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    mock_livekit_client.room.list_participants.assert_not_called()


@override_settings(ALLOW_UNREGISTERED_ROOMS=True)
def test_participants_refuses_a_name_that_slugifies_to_nothing(mock_livekit_client):
    """A name with nothing url-safe in it is no room, rather than every room."""
    response = APIClient().get(reverse("rooms-participants", kwargs={"pk": "___"}))

    assert response.status_code == status.HTTP_404_NOT_FOUND
    mock_livekit_client.room.list_participants.assert_not_called()


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


def test_participants_is_throttled_under_its_own_scope(mock_livekit_client):
    """A scoped throttle whose scope never reaches the view allows everything.

    One class rather than an authenticated and an anonymous pair, so a request
    cannot build the same key twice and spend two of its own allowance.
    """
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    url = reverse("rooms-participants", kwargs={"pk": room.id})

    with mock.patch.object(
        MonitoredScopedRateThrottle, "get_rate", return_value="1/minute"
    ):
        first = APIClient().get(url)
        second = APIClient().get(url)

    assert first.status_code == status.HTTP_200_OK
    assert second.status_code == status.HTTP_429_TOO_MANY_REQUESTS
