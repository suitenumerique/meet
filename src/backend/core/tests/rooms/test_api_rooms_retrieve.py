"""Test rooms API endpoints in the Meet core app: retrieve."""

import random
from unittest import mock

from django.test.utils import override_settings
from django.utils import timezone as dj_timezone

import pytest
from rest_framework.test import APIClient

from ...factories import (
    RoomFactory,
    UserFactory,
    UserResourceAccessFactory,
)
from ...models import RoleChoices, RoomAccessLevel
from ..utils import generate_user_access_token

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
@mock.patch("core.utils.generate_token", return_value="foo")
def test_api_rooms_retrieve_anonymous_unregistered_allowed(mock_token):
    """
    Retrieving an unregistered room should describe it if unregistered rooms
    are allowed, without any LiveKit token: those are obtained by joining.
    """
    client = APIClient()
    response = client.get("/api/v1.0/rooms/unregistered-room/")

    assert response.status_code == 200
    assert response.json() == {
        "id": None,
        "slug": "unregistered-room",
        "access_level": "public",
    }

    mock_token.assert_not_called()


@override_settings(ALLOW_UNREGISTERED_ROOMS=True)
@mock.patch("core.utils.generate_token", return_value="foo")
def test_api_rooms_retrieve_anonymous_unregistered_allowed_not_normalized(mock_token):
    """
    Getting an unregistered room by a slug that is not normalized should work
    and return the url-safe slug.
    """
    client = APIClient()
    response = client.get("/api/v1.0/rooms/Réunion/")

    assert response.status_code == 200
    assert response.json() == {
        "id": None,
        "slug": "reunion",
        "access_level": "public",
    }

    mock_token.assert_not_called()


@override_settings(ALLOW_UNREGISTERED_ROOMS=False)
def test_api_rooms_retrieve_anonymous_unregistered_not_allowed():
    """
    Retrieving an unregistered room should return a 404 if unregistered rooms are not allowed.
    """
    client = APIClient()
    response = client.get("/api/v1.0/rooms/unregistered-room/")

    assert response.status_code == 404
    assert response.json() == {"detail": "No Room matches the given query."}


@override_settings(ALLOW_UNREGISTERED_ROOMS=True)
@pytest.mark.parametrize("lookup", ["---", "!!!", "_"])
def test_api_rooms_retrieve_anonymous_unregistered_empty_slug(lookup):
    """
    Retrieving an unregistered room whose slug is empty once normalized should
    return a 404.
    """
    client = APIClient()
    response = client.get(f"/api/v1.0/rooms/{lookup}/")

    assert response.status_code == 404
    assert response.json() == {"detail": "No Room matches the given query."}


@pytest.mark.parametrize("allow_unregistered_rooms", [True, False])
@pytest.mark.parametrize("lookup", ["id", "slug"])
@mock.patch("core.utils.generate_token", return_value="foo")
def test_api_rooms_retrieve_soft_deleted(
    mock_token, lookup, allow_unregistered_rooms, settings
):
    """
    Retrieving a soft-deleted room should return a 410, and never fall back
    to an unregistered room with the same slug.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = allow_unregistered_rooms
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    room.soft_delete()

    client = APIClient()
    response = client.get(f"/api/v1.0/rooms/{getattr(room, lookup)!s}/")

    assert response.status_code == 410
    assert response.json() == {"detail": "This room has been deleted."}
    mock_token.assert_not_called()


@mock.patch("core.utils.generate_token", return_value="foo")
def test_api_rooms_retrieve_anonymous_public(mock_token):
    """
    Anonymous users should be able to retrieve a public room with its pin code,
    but should not be given any token: those are obtained by joining.
    """
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()
    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert response.json() == {
        "configuration": {},
        "access_level": str(room.access_level),
        "id": str(room.id),
        "name": room.name,
        "pin_code": room.pin_code,
        "slug": room.slug,
    }

    mock_token.assert_not_called()


@mock.patch("core.utils.generate_token", return_value="foo")
def test_api_rooms_retrieve_authenticated_public(mock_token):
    """
    Authenticated users should be allowed to retrieve a public room to which
    they are not related, with its pin code but without any token.
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

    assert response.json() == {
        "configuration": {"can_publish_sources": ["camera"]},
        "access_level": str(room.access_level),
        "id": str(room.id),
        "name": room.name,
        "pin_code": room.pin_code,
        "slug": room.slug,
    }

    mock_token.assert_not_called()


@mock.patch("core.utils.generate_token", return_value="foo")
def test_api_rooms_retrieve_authenticated_trusted(mock_token):
    """
    Authenticated users should be allowed to retrieve a trusted room to which
    they are not related, with its pin code but without any token.
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

    assert response.json() == {
        "configuration": {},
        "access_level": str(room.access_level),
        "id": str(room.id),
        "name": room.name,
        "pin_code": room.pin_code,
        "slug": room.slug,
    }

    mock_token.assert_not_called()


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

    assert content_dict == {
        "configuration": {"can_publish_sources": ["camera"]},
        "access_level": str(room.access_level),
        "id": str(room.id),
        "name": room.name,
        "pin_code": room.pin_code,
        "slug": room.slug,
    }

    mock_token.assert_not_called()


@mock.patch("core.utils.generate_token", return_value="foo")
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
    assert content_dict == {
        "access_level": str(room.access_level),
        "id": str(room.id),
        "configuration": {},
        "name": room.name,
        "pin_code": room.pin_code,
        "slug": room.slug,
    }

    mock_token.assert_not_called()


@pytest.mark.parametrize("access_level", RoomAccessLevel)
@pytest.mark.parametrize("role", [None, *RoleChoices])
def test_api_rooms_retrieve_last_started_at_not_exposed(role, access_level):
    """Should not expose when the room was last started, whoever the requester is."""
    room = RoomFactory(access_level=access_level, last_started_at=dj_timezone.now())
    client = APIClient()
    user = UserFactory()
    if role is not None:
        UserResourceAccessFactory(resource=room, user=user, role=role)
    client.force_login(user)

    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert "last_started_at" not in response.json()


def test_api_rooms_retrieve_authenticated_with_user_access_token():
    """A user access token should retrieve a room exactly like a session would."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_user_access_token(user)}")
    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert response.data["id"] == str(room.id)
    assert response.data["pin_code"] == room.pin_code
    assert "accesses" in response.data
    assert "livekit" not in response.data


@pytest.mark.parametrize("access_level", RoomAccessLevel)
@pytest.mark.parametrize("role", [None, *RoleChoices])
@mock.patch("core.utils.generate_token", return_value="foo")
def test_api_rooms_retrieve_never_returns_livekit_credentials(
    mock_token, role, access_level
):
    """Retrieving a room should never mint a LiveKit token."""
    room = RoomFactory(access_level=access_level)
    user = UserFactory()
    if role is not None:
        UserResourceAccessFactory(resource=room, user=user, role=role)
    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert "livekit" not in response.json()
    mock_token.assert_not_called()


@pytest.mark.parametrize("access_level", RoomAccessLevel)
@mock.patch("core.utils.generate_token", return_value="foo")
def test_api_rooms_retrieve_anonymous_never_returns_livekit_credentials(
    mock_token, access_level
):
    """An anonymous user should never get a LiveKit token by retrieving a room."""
    room = RoomFactory(access_level=access_level)

    response = APIClient().get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert "livekit" not in response.json()
    mock_token.assert_not_called()


@pytest.mark.parametrize(
    ("access_level", "authenticated", "role", "pin_code_exposed"),
    [
        (RoomAccessLevel.PUBLIC, False, None, True),
        (RoomAccessLevel.TRUSTED, False, None, False),
        (RoomAccessLevel.RESTRICTED, False, None, False),
        (RoomAccessLevel.PUBLIC, True, None, True),
        (RoomAccessLevel.TRUSTED, True, None, True),
        (RoomAccessLevel.RESTRICTED, True, None, False),
        (RoomAccessLevel.RESTRICTED, True, RoleChoices.MEMBER, True),
        (RoomAccessLevel.RESTRICTED, True, RoleChoices.ADMIN, True),
        (RoomAccessLevel.RESTRICTED, True, RoleChoices.OWNER, True),
    ],
)
def test_api_rooms_retrieve_pin_code_exposure(
    access_level, authenticated, role, pin_code_exposed
):
    """
    The pin code should only be exposed to users who may join the room
    without going through the lobby.
    """
    room = RoomFactory(access_level=access_level)
    client = APIClient()
    if authenticated:
        user = UserFactory()
        if role is not None:
            UserResourceAccessFactory(resource=room, user=user, role=role)
        client.force_login(user)

    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert ("pin_code" in response.json()) is pin_code_exposed
    if pin_code_exposed:
        assert response.json()["pin_code"] == room.pin_code
