"""
Test rooms API endpoints in the Meet core app: retrieve.
"""

import random
from unittest import mock

from django.conf import settings as django_settings
from django.contrib.auth.models import AnonymousUser
from django.test.utils import override_settings

import jwt
import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory, UserResourceAccessFactory
from ...models import RoleChoices, RoomAccessLevel

pytestmark = pytest.mark.django_db


def test_api_rooms_retrieve_anonymous_private_pk():
    """
    Anonymous users should be allowed to retrieve a private room but should not be
    given any token.
    """
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()
    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert response.json() == {
        "configuration": {},
        "access_level": "restricted",
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
    }


def test_api_rooms_retrieve_anonymous_trusted_pk():
    """
    Anonymous users should be allowed to retrieve a room that has a trusted access_level,
    but should not be given any token.
    """
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    client = APIClient()
    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert response.json() == {
        "configuration": {},
        "access_level": "trusted",
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
    }


def test_api_rooms_retrieve_anonymous_private_pk_no_dashes():
    """It should be possible to get a room by its id stripped of its dashes."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    id_no_dashes = str(room.id)

    client = APIClient()
    response = client.get(f"/api/v1.0/rooms/{id_no_dashes:s}/")

    assert response.status_code == 200
    assert response.json() == {
        "configuration": {},
        "access_level": "restricted",
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
    }


def test_api_rooms_retrieve_anonymous_private_slug():
    """It should be possible to get a room by its slug."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()
    response = client.get(f"/api/v1.0/rooms/{room.slug!s}/")

    assert response.status_code == 200
    assert response.json() == {
        "configuration": {},
        "access_level": "restricted",
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
    }


def test_api_rooms_retrieve_anonymous_private_slug_not_normalized():
    """Getting a room by a slug that is not normalized should work."""
    room = RoomFactory(name="Réunion", access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()
    response = client.get("/api/v1.0/rooms/Réunion/")

    assert response.status_code == 200
    assert response.json() == {
        "configuration": {},
        "access_level": "restricted",
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
    }


@override_settings(ALLOW_UNREGISTERED_ROOMS=True)
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
@mock.patch("core.utils.generate_token", return_value="foo")
def test_api_rooms_retrieve_anonymous_unregistered_allowed(mock_token):
    """
    Retrieving an unregistered room should return a Livekit token
    if unregistered rooms are allowed.
    """
    client = APIClient()
    response = client.get("/api/v1.0/rooms/unregistered-room/")

    assert response.status_code == 200
    assert response.json() == {
        "id": None,
        "slug": "unregistered-room",
        "access_level": "public",
        "is_administrable": False,
        "livekit": {
            "url": "test_url_value",
            "room": "unregistered-room",
            "token": "foo",
        },
    }

    mock_token.assert_called_once_with(
        room="unregistered-room",
        user=AnonymousUser(),
        display_name="Anonymous",
        color=None,
        sources=None,
        role=None,
        participant_id=mock.ANY,
    )


@override_settings(ALLOW_UNREGISTERED_ROOMS=True)
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
@mock.patch("core.utils.generate_token", return_value="foo")
def test_api_rooms_retrieve_anonymous_unregistered_allowed_not_normalized(mock_token):
    """
    Getting an unregistered room by a slug that is not normalized should work
    and use the Livekit room on the url-safe name.
    """
    client = APIClient()
    response = client.get("/api/v1.0/rooms/Réunion/")

    assert response.status_code == 200
    assert response.json() == {
        "id": None,
        "slug": "reunion",
        "access_level": "public",
        "is_administrable": False,
        "livekit": {
            "url": "test_url_value",
            "room": "reunion",
            "token": "foo",
        },
    }

    mock_token.assert_called_once_with(
        room="reunion",
        user=AnonymousUser(),
        display_name="Anonymous",
        color=None,
        sources=None,
        role=None,
        participant_id=mock.ANY,
    )


@override_settings(ALLOW_UNREGISTERED_ROOMS=False)
def test_api_rooms_retrieve_anonymous_unregistered_not_allowed():
    """
    Retrieving an unregistered room should return a 404 if unregistered rooms are not allowed.
    """
    client = APIClient()
    response = client.get("/api/v1.0/rooms/unregistered-room/")

    assert response.status_code == 404
    assert response.json() == {"detail": "No Room matches the given query."}


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_anonymous_public(mock_token):
    """
    Anonymous users should be able to retrieve a room with a token provided, if the room is public.
    """
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()
    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    expected_name = f"{room.id!s}"
    assert response.json() == {
        "configuration": {},
        "access_level": str(room.access_level),
        "id": str(room.id),
        "livekit": {
            "url": "test_url_value",
            "room": expected_name,
            "token": "foo",
        },
        "name": room.name,
        "pin_code": room.pin_code,
        "slug": room.slug,
    }

    mock_token.assert_called_once()


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_authenticated_public(mock_token):
    """
    Authenticated users should be allowed to retrieve a room and get a token for a room to
    which they are not related, provided the room is public.
    They should not see related users.
    """
    room = RoomFactory(
        access_level=RoomAccessLevel.PUBLIC,
        configuration={"can_publish_sources": ["camera"]},
    )

    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.get(
        f"/api/v1.0/rooms/{room.id!s}/",
    )
    assert response.status_code == 200

    expected_name = f"{room.id!s}"
    assert response.json() == {
        "configuration": {"can_publish_sources": ["camera"]},
        "access_level": str(room.access_level),
        "id": str(room.id),
        "livekit": {
            "url": "test_url_value",
            "room": expected_name,
            "token": "foo",
        },
        "name": room.name,
        "pin_code": room.pin_code,
        "slug": room.slug,
    }

    mock_token.assert_called_once_with(
        room=expected_name,
        user=user,
        display_name=user.full_name,
        color=None,
        sources=["camera"],
        role=None,
        participant_id=str(user.sub),
    )


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_authenticated_trusted(mock_token):
    """
    Authenticated users should be allowed to retrieve a room and get a token for a room to
    which they are not related, provided the room has a trusted access_level.
    They should not see related users.
    """
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)

    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.get(
        f"/api/v1.0/rooms/{room.id!s}/",
    )
    assert response.status_code == 200

    expected_name = f"{room.id!s}"
    assert response.json() == {
        "configuration": {},
        "access_level": str(room.access_level),
        "id": str(room.id),
        "livekit": {
            "url": "test_url_value",
            "room": expected_name,
            "token": "foo",
        },
        "name": room.name,
        "pin_code": room.pin_code,
        "slug": room.slug,
    }

    mock_token.assert_called_once_with(
        room=expected_name,
        user=user,
        display_name=user.full_name,
        color=None,
        sources=None,
        role=None,
        participant_id=str(user.sub),
    )


def test_api_rooms_retrieve_authenticated():
    """
    Authenticated users should be allowed to retrieve a private room to which they
    are not related but should not be given any token.
    """
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.get(
        f"/api/v1.0/rooms/{room.id!s}/",
    )
    assert response.status_code == 200

    assert response.json() == {
        "configuration": {},
        "access_level": "restricted",
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
    }


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_members(mock_token, django_assert_num_queries, settings):
    """
    Users who are members of a room should not be allowed to see related users.
    """
    settings.TIME_ZONE = "UTC"
    user = UserFactory()
    other_user = UserFactory()

    room = RoomFactory(
        configuration={"can_publish_sources": ["camera"]},
    )
    UserResourceAccessFactory(resource=room, user=user, role="member")
    UserResourceAccessFactory(resource=room, user=other_user, role="member")

    client = APIClient()
    client.force_login(user)

    with django_assert_num_queries(3):
        response = client.get(
            f"/api/v1.0/rooms/{room.id!s}/",
        )

    assert response.status_code == 200
    content_dict = response.json()

    assert "accesses" not in content_dict

    expected_name = str(room.id)
    assert content_dict == {
        "configuration": {"can_publish_sources": ["camera"]},
        "access_level": str(room.access_level),
        "id": str(room.id),
        "livekit": {
            "url": "test_url_value",
            "room": expected_name,
            "token": "foo",
        },
        "name": room.name,
        "pin_code": room.pin_code,
        "slug": room.slug,
    }

    mock_token.assert_called_once_with(
        room=expected_name,
        user=user,
        display_name=user.full_name,
        color=None,
        sources=["camera"],
        role=str(RoleChoices.MEMBER),
        participant_id=str(user.sub),
    )


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_administrators(
    mock_token, django_assert_num_queries, settings
):
    """
    A user who is an administrator or owner of a room should be allowed
    to see related users.
    """
    settings.TIME_ZONE = "UTC"
    user = UserFactory()
    other_user = UserFactory()
    room = RoomFactory()
    user_access = UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    other_user_access = UserResourceAccessFactory(
        resource=room, user=other_user, role="member"
    )
    client = APIClient()
    client.force_login(user)

    with django_assert_num_queries(4):
        response = client.get(
            f"/api/v1.0/rooms/{room.id!s}/",
        )
    assert response.status_code == 200
    content_dict = response.json()

    assert sorted(content_dict.pop("accesses"), key=lambda x: x["id"]) == sorted(
        [
            {
                "id": str(other_user_access.id),
                "user": {
                    "default_room_access_level": None,
                    "default_room_configuration": {},
                    "id": str(other_user_access.user.id),
                    "email": other_user_access.user.email,
                    "full_name": other_user_access.user.full_name,
                    "short_name": other_user_access.user.short_name,
                    "timezone": "UTC",
                    "language": other_user_access.user.language,
                },
                "resource": str(room.id),
                "role": other_user_access.role,
            },
            {
                "id": str(user_access.id),
                "user": {
                    "default_room_access_level": None,
                    "default_room_configuration": {},
                    "id": str(user_access.user.id),
                    "email": user_access.user.email,
                    "full_name": user_access.user.full_name,
                    "short_name": user_access.user.short_name,
                    "timezone": "UTC",
                    "language": user_access.user.language,
                },
                "resource": str(room.id),
                "role": user_access.role,
            },
        ],
        key=lambda x: x["id"],
    )
    expected_name = str(room.id)
    assert content_dict == {
        "access_level": str(room.access_level),
        "id": str(room.id),
        "configuration": {},
        "livekit": {
            "url": "test_url_value",
            "room": expected_name,
            "token": "foo",
        },
        "name": room.name,
        "pin_code": room.pin_code,
        "slug": room.slug,
    }

    mock_token.assert_called_once_with(
        room=expected_name,
        user=user,
        display_name=user.full_name,
        color=None,
        sources=None,
        role=str(user_access.role),
        participant_id=str(user.sub),
    )


def test_api_rooms_retrieve_numbers_a_name_held_in_the_room(
    mock_list_participant_names,
):
    """Fetching one room issues a token numbered against who is already there."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    mock_list_participant_names.return_value = {"someone-else": "Jane Doe"}

    response = APIClient().get(f"/api/v1.0/rooms/{room.id!s}/?username=Jane%20Doe")

    assert response.status_code == 200
    token = response.json()["livekit"]["token"]
    claims = jwt.decode(
        token, django_settings.LIVEKIT_CONFIGURATION["api_secret"], algorithms=["HS256"]
    )
    assert claims["name"] == "Jane Doe (2)"


def test_api_rooms_retrieve_keeps_one_identity_across_fetches(
    mock_list_participant_names,
):
    """A guest reloading is the same participant, not a second one."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()

    first = client.get(f"/api/v1.0/rooms/{room.id!s}/?username=Jane%20Doe")
    identity = jwt.decode(
        first.json()["livekit"]["token"],
        django_settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
    )["sub"]

    mock_list_participant_names.return_value = {identity: "Jane Doe"}
    second = client.get(f"/api/v1.0/rooms/{room.id!s}/?username=Jane%20Doe")
    claims = jwt.decode(
        second.json()["livekit"]["token"],
        django_settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
    )

    assert claims["sub"] == identity
    assert claims["name"] == "Jane Doe"
