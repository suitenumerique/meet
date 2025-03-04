"""
Test rooms API endpoints in the Meet core app: retrieve.
"""

import random
from unittest import mock

from django.contrib.auth.models import AnonymousUser
from django.test.utils import override_settings

import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory, UserResourceAccessFactory
from ...models import RoomAccessLevel

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
        "access_level": "restricted",
        "id": str(room.id),
        "is_administrable": False,
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
        "access_level": "trusted",
        "id": str(room.id),
        "is_administrable": False,
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
        "access_level": "restricted",
        "id": str(room.id),
        "is_administrable": False,
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
        "access_level": "restricted",
        "id": str(room.id),
        "is_administrable": False,
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
        "access_level": "restricted",
        "id": str(room.id),
        "is_administrable": False,
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
        "livekit": {
            "url": "test_url_value",
            "room": "unregistered-room",
            "token": "foo",
        },
    }

    mock_token.assert_called_once_with(
        room="unregistered-room", user=AnonymousUser(), username=None
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
        "livekit": {
            "url": "test_url_value",
            "room": "reunion",
            "token": "foo",
        },
    }

    mock_token.assert_called_once_with(
        room="reunion", user=AnonymousUser(), username=None
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
        "access_level": str(room.access_level),
        "id": str(room.id),
        "is_administrable": False,
        "livekit": {
            "url": "test_url_value",
            "room": expected_name,
            "token": "foo",
        },
        "name": room.name,
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
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.get(
        f"/api/v1.0/rooms/{room.id!s}/",
    )
    assert response.status_code == 200

    expected_name = f"{room.id!s}"
    assert response.json() == {
        "access_level": str(room.access_level),
        "id": str(room.id),
        "is_administrable": False,
        "livekit": {
            "url": "test_url_value",
            "room": expected_name,
            "token": "foo",
        },
        "name": room.name,
        "slug": room.slug,
    }

    mock_token.assert_called_once_with(
        room=expected_name, user=user, username=None, color=None
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
        "access_level": str(room.access_level),
        "id": str(room.id),
        "is_administrable": False,
        "livekit": {
            "url": "test_url_value",
            "room": expected_name,
            "token": "foo",
        },
        "name": room.name,
        "slug": room.slug,
    }

    mock_token.assert_called_once_with(
        room=expected_name, user=user, username=None, color=None
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
        "access_level": "restricted",
        "id": str(room.id),
        "is_administrable": False,
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
def test_api_rooms_retrieve_members(mock_token, django_assert_num_queries):
    """
    Users who are members of a room should be allowed to see related users.
    """
    user = UserFactory()
    other_user = UserFactory()

    room = RoomFactory()
    user_access = UserResourceAccessFactory(resource=room, user=user, role="member")
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
                "id": str(user_access.id),
                "user": {
                    "id": str(user_access.user.id),
                    "email": user_access.user.email,
                    "full_name": user_access.user.full_name,
                    "short_name": user_access.user.short_name,
                },
                "resource": str(room.id),
                "role": user_access.role,
            },
            {
                "id": str(other_user_access.id),
                "user": {
                    "id": str(other_user_access.user.id),
                    "email": other_user_access.user.email,
                    "full_name": other_user_access.user.full_name,
                    "short_name": other_user_access.user.short_name,
                },
                "resource": str(room.id),
                "role": other_user_access.role,
            },
        ],
        key=lambda x: x["id"],
    )

    expected_name = str(room.id)
    assert content_dict == {
        "access_level": str(room.access_level),
        "id": str(room.id),
        "is_administrable": False,
        "livekit": {
            "url": "test_url_value",
            "room": expected_name,
            "token": "foo",
        },
        "name": room.name,
        "slug": room.slug,
    }

    mock_token.assert_called_once_with(
        room=expected_name, user=user, username=None, color=None
    )


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_administrators(mock_token, django_assert_num_queries):
    """
    A user who is an administrator or owner of a room should be allowed
    to see related users.
    """
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
                    "id": str(other_user_access.user.id),
                    "email": other_user_access.user.email,
                    "full_name": other_user_access.user.full_name,
                    "short_name": other_user_access.user.short_name,
                },
                "resource": str(room.id),
                "role": other_user_access.role,
            },
            {
                "id": str(user_access.id),
                "user": {
                    "id": str(user_access.user.id),
                    "email": user_access.user.email,
                    "full_name": user_access.user.full_name,
                    "short_name": user_access.user.short_name,
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
        "is_administrable": True,
        "configuration": {},
        "livekit": {
            "url": "test_url_value",
            "room": expected_name,
            "token": "foo",
        },
        "name": room.name,
        "slug": room.slug,
    }

    mock_token.assert_called_once_with(
        room=expected_name, user=user, username=None, color=None
    )
