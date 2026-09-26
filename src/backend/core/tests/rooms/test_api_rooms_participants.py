"""
Test rooms API endpoints in the Meet core app: participants.
"""

# pylint: disable=redefined-outer-name,unused-argument,no-name-in-module

import random
from unittest import mock

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

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("local_cache")]

INSIDE = {"count": 2, "names": ["Zora", "Neel"]}


def in_the_room(mock_livekit_client, *names):
    """Have LiveKit report these people in every room."""
    mock_livekit_client.room.list_participants.return_value = ListParticipantsResponse(
        participants=[ParticipantInfo(name=name) for name in names]
    )


@pytest.fixture
def mock_livekit_client():
    """Mock LiveKit API client, reporting Zora and Neel in every room."""
    with mock.patch("core.utils.create_livekit_client") as mock_create:
        mock_client = mock.AsyncMock()
        in_the_room(mock_client, "Zora", "Neel")
        mock_create.return_value = mock_client
        yield mock_client


def signed_in():
    """An API client signed in as a new user."""
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    return client


@pytest.mark.parametrize(
    "access_level,sign_in,with_role,expected",
    [
        # Nobody is told who is inside without signing in, even in a public room.
        (RoomAccessLevel.PUBLIC, False, False, status.HTTP_404_NOT_FOUND),
        (RoomAccessLevel.PUBLIC, True, False, status.HTTP_200_OK),
        (RoomAccessLevel.TRUSTED, False, False, status.HTTP_404_NOT_FOUND),
        (RoomAccessLevel.TRUSTED, True, False, status.HTTP_200_OK),
        # A restricted room tells the people invited to it.
        (RoomAccessLevel.RESTRICTED, False, False, status.HTTP_404_NOT_FOUND),
        (RoomAccessLevel.RESTRICTED, True, False, status.HTTP_404_NOT_FOUND),
        (RoomAccessLevel.RESTRICTED, True, True, status.HTTP_200_OK),
    ],
)
def test_participants_answers_signed_in_users_the_room_would_admit(
    mock_livekit_client, access_level, sign_in, with_role, expected
):
    """Only a signed-in user the room lets in without approval is told."""
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

    response = signed_in().get(reverse("rooms-participants", kwargs={"pk": room.slug}))

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == INSIDE


def test_participants_of_an_empty_meeting(mock_livekit_client):
    """A meeting nobody has joined counts nobody."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    mock_livekit_client.room.list_participants.side_effect = TwirpError(
        "not_found", "room not found", status=404
    )

    response = signed_in().get(reverse("rooms-participants", kwargs={"pk": room.id}))

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"count": 0, "names": []}


def test_participants_names_everyone_up_to_the_limit(mock_livekit_client):
    """At the limit, everyone is still counted and named."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    names = [f"P{i:d}" for i in range(5)]
    in_the_room(mock_livekit_client, *names)

    response = signed_in().get(reverse("rooms-participants", kwargs={"pk": room.id}))

    assert response.json() == {"count": 5, "names": names}


@override_settings(ROOM_PARTICIPANTS_NAMES_LIMIT=1)
def test_participants_past_the_limit_only_says_the_meeting_started(
    mock_livekit_client,
):
    """Past the limit nobody is named or counted, whatever the caller asks for."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    url = reverse("rooms-participants", kwargs={"pk": room.id})

    response = signed_in().get(url, {"names": 100})

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"count": None, "names": []}


@override_settings(ALLOW_UNREGISTERED_ROOMS=True)
def test_participants_unregistered_room(mock_livekit_client):
    """An unregistered room has no one to tell, so it is not found."""
    response = signed_in().get(
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

    first = signed_in().get(url)
    second = signed_in().get(url)

    assert first.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert second.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert mock_livekit_client.room.list_participants.call_count == 1


def test_participants_is_throttled(mock_livekit_client):
    """Polling past the rate is refused."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    url = reverse("rooms-participants", kwargs={"pk": room.id})
    client = signed_in()

    with mock.patch.object(
        ParticipantsUserRateThrottle, "get_rate", return_value="1/minute"
    ):
        first = client.get(url)
        second = client.get(url)

    assert first.status_code == status.HTTP_200_OK
    assert second.status_code == status.HTTP_429_TOO_MANY_REQUESTS
