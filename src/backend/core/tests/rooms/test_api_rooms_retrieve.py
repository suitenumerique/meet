"""
Test rooms API endpoints in the Meet core app: retrieve.
"""

import random
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from unittest import mock

from django.contrib.auth.models import AnonymousUser
from django.http import HttpRequest
from django.test.utils import override_settings
from django.utils import timezone

import pytest
from freezegun import freeze_time
from rest_framework.test import APIClient

from core.services.lobby import LobbyService

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
        username=None,
        color=None,
        sources=["camera"],
        role=None,
        participant_id=None,
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
        username=None,
        color=None,
        sources=None,
        role=None,
        participant_id=None,
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
        username=None,
        color=None,
        sources=["camera"],
        role=str(RoleChoices.MEMBER),
        participant_id=None,
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
        username=None,
        color=None,
        sources=None,
        role=str(user_access.role),
        participant_id=None,
    )


@pytest.mark.parametrize("access_level", RoomAccessLevel)
@pytest.mark.parametrize("role", [None, *RoleChoices])
def test_api_rooms_retrieve_last_started_at_not_exposed(role, access_level):
    """Should not expose when the room was last started, whoever the requester is."""
    room = RoomFactory(access_level=access_level, last_started_at=timezone.now())
    client = APIClient()
    user = UserFactory()
    if role is not None:
        UserResourceAccessFactory(resource=room, user=user, role=role)
    client.force_login(user)

    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert "last_started_at" not in response.json()


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_anonymous_public_issues_lobby_identity(
    mock_token, settings
):
    """A guest entering a public room directly gets the lobby's signed identity."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()

    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    cookie = response.cookies[settings.LOBBY_COOKIE_NAME]
    assert cookie["httponly"] is True
    assert cookie["secure"] is True

    identity = mock_token.call_args.kwargs["participant_id"]
    assert identity.startswith("guest_")

    replay = HttpRequest()
    replay.COOKIES[settings.LOBBY_COOKIE_NAME] = cookie.value
    assert LobbyService.get_or_create_participant_id(replay, room.id) == identity


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_authenticated_public_sets_no_guest_cookie(
    mock_token, settings
):
    """Authenticated users are identified by their sub, never by a guest cookie."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()
    client.force_login(UserFactory())

    response = client.get(f"/api/v1.0/rooms/{room.id!s}/")

    assert response.status_code == 200
    assert settings.LOBBY_COOKIE_NAME not in response.cookies
    assert mock_token.call_args.kwargs["participant_id"] is None


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_anonymous_public_one_guest_cookie(mock_token, settings):
    """A guest opening many public rooms keeps a single cookie.

    gunicorn refuses a Cookie header past 8190 bytes, so a cookie per room
    locks the browser out after about thirty meetings.
    """
    client = APIClient()

    for _ in range(40):
        room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
        response = client.get(f"/api/v1.0/rooms/{room.id!s}/")
        assert response.status_code == 200

    assert list(client.cookies) == [settings.LOBBY_COOKIE_NAME]
    identities = {call.kwargs["participant_id"] for call in mock_token.call_args_list}
    assert len(identities) == 40


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_anonymous_public_identity_outlives_first_issue(
    mock_token, settings
):
    """A guest who keeps visiting keeps one identity past the signature age."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()
    start = datetime(2026, 9, 29, 8, 0, tzinfo=dt_timezone.utc)
    age = timedelta(seconds=settings.SESSION_COOKIE_AGE)

    for elapsed in (timedelta(0), age - timedelta(hours=1), age + timedelta(minutes=1)):
        with freeze_time(start + elapsed):
            response = client.get(f"/api/v1.0/rooms/{room.id!s}/")
        assert response.status_code == 200

    identities = [call.kwargs["participant_id"] for call in mock_token.call_args_list]
    assert identities == [identities[0]] * 3


@mock.patch("core.utils.generate_token", return_value="foo")
@override_settings(
    LIVEKIT_CONFIGURATION={
        "api_key": "key",
        "api_secret": "secret",
        "url": "test_url_value",
    }
)
def test_api_rooms_retrieve_anonymous_public_identity_expires_when_idle(
    mock_token, settings
):
    """A guest idle past the signature age gets a new identity."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()
    start = datetime(2026, 9, 29, 8, 0, tzinfo=dt_timezone.utc)
    age = timedelta(seconds=settings.SESSION_COOKIE_AGE)

    for elapsed in (timedelta(0), age + timedelta(minutes=1)):
        with freeze_time(start + elapsed):
            response = client.get(f"/api/v1.0/rooms/{room.id!s}/")
        assert response.status_code == 200

    first, second = [
        call.kwargs["participant_id"] for call in mock_token.call_args_list
    ]
    assert first != second
