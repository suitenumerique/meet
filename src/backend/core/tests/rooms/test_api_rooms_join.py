"""
Test rooms API endpoints in the Meet core app: join.
"""

# pylint: disable=redefined-outer-name

from unittest import mock

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.utils.crypto import get_random_string

import jwt
import pytest
from faker import Faker
from rest_framework.test import APIClient

from ...factories import (
    RoomFactory,
    UserFactory,
    UserResourceAccessFactory,
)
from ...models import RoleChoices, RoomAccessLevel
from ..utils import generate_user_access_token

fake = Faker()
pytestmark = pytest.mark.django_db

livekit_token = fake.sha256()

ANONYMOUS = "anonymous"
NO_ROLE = "no-role"

# Who may join a room directly, without going through the lobby
# room.get_role(user) returns None both for an anonymous user and for an
# authenticated user without access, hence the NO_ROLE
ACCESS_MATRIX = [
    (RoomAccessLevel.PUBLIC, ANONYMOUS, True),
    (RoomAccessLevel.TRUSTED, ANONYMOUS, False),
    (RoomAccessLevel.RESTRICTED, ANONYMOUS, False),
    (RoomAccessLevel.PUBLIC, NO_ROLE, True),
    (RoomAccessLevel.TRUSTED, NO_ROLE, True),
    (RoomAccessLevel.RESTRICTED, NO_ROLE, False),
    *[
        (access_level, role, True)
        for access_level in RoomAccessLevel
        for role in RoleChoices
    ],
]


def decode_token(token):
    """Decode a LiveKit access token for inspection."""
    return jwt.decode(
        token,
        settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
    )


def join_url(room_id):
    """Return the url to join a room."""
    return f"/api/v1.0/rooms/{room_id!s}/join/"


@pytest.mark.parametrize(
    ("access_level", "requester", "can_join_directly"), ACCESS_MATRIX
)
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_access(mock_token, access_level, requester, can_join_directly):
    """
    Joining a room should return LiveKit credentials and the pin code only to
    users who may enter without going through the lobby, and the accesses
    only to the room's administrators and owners.
    """
    room = RoomFactory(
        access_level=access_level,
        configuration={"can_publish_sources": ["camera"]},
    )
    client = APIClient()
    user = AnonymousUser()
    username = fake.user_name()

    role = None
    if requester != ANONYMOUS:
        user = UserFactory()
        client.force_login(user)
        if requester != NO_ROLE:
            role = requester
            UserResourceAccessFactory(resource=room, user=user, role=role)

    response = client.post(join_url(room.id), {"username": username}, format="json")

    assert response.status_code == 200
    content = response.json()

    accesses = content.pop("accesses", None)

    if role in (RoleChoices.ADMIN, RoleChoices.OWNER):
        assert {access["id"] for access in accesses} == {
            str(access.id) for access in room.accesses.all()
        }
    else:
        assert accesses is None

    expected = {
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
        "configuration": {"can_publish_sources": ["camera"]},
        "access_level": str(access_level),
    }
    if can_join_directly:
        expected["pin_code"] = room.pin_code
        expected["livekit"] = {
            "url": settings.LIVEKIT_CONFIGURATION["url"],
            "room": str(room.id),
            "token": livekit_token,
        }
    assert content == expected

    if can_join_directly:
        mock_token.assert_called_once_with(
            room=str(room.id),
            user=user,
            username=username,
            color=None,
            sources=["camera"],
            role=role,
            participant_id=None,
        )
    else:
        mock_token.assert_not_called()


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_by_slug(mock_token):
    """It should be possible to join a room by its slug, not normalized."""
    room = RoomFactory(name="Réunion", access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(join_url("Réunion"), {}, format="json")

    assert response.status_code == 200
    assert response.json()["id"] == str(room.id)
    assert response.json()["livekit"]["room"] == str(room.id)
    mock_token.assert_called_once()


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_members_num_queries(mock_token, django_assert_num_queries):
    """The role of the requester should only be looked up once."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    UserResourceAccessFactory(resource=room, user=user, role=RoleChoices.MEMBER)
    client = APIClient()
    client.force_login(user)

    with django_assert_num_queries(3):
        response = client.post(join_url(room.id), {}, format="json")

    assert response.status_code == 200
    assert "livekit" in response.json()
    assert mock_token.call_args.kwargs["role"] == RoleChoices.MEMBER


@pytest.mark.parametrize("role", [RoleChoices.ADMIN, RoleChoices.OWNER])
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_administrators_num_queries(
    mock_token, role, django_assert_num_queries
):
    """Only the accesses should be queried on top of the role for administrators."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    UserResourceAccessFactory(resource=room, user=user, role=role)
    client = APIClient()
    client.force_login(user)

    with django_assert_num_queries(4):
        response = client.post(join_url(room.id), {}, format="json")

    assert response.status_code == 200
    assert "livekit" in response.json()
    assert "accesses" in response.json()
    assert mock_token.call_args.kwargs["role"] == role


def test_api_rooms_join_get_not_allowed():
    """Joining a room should only be possible with a POST request."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().get(join_url(room.id))

    assert response.status_code == 405


@pytest.mark.parametrize("authenticated", [False, True])
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_unregistered_allowed(mock_token, authenticated, settings):
    """
    Joining an unregistered room should return LiveKit credentials for the
    room named after the slug, when unregistered rooms are allowed.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = True
    client = APIClient()
    user = AnonymousUser()
    username = fake.user_name()
    if authenticated:
        user = UserFactory()
        client.force_login(user)

    response = client.post(
        join_url("unregistered-room"), {"username": username}, format="json"
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": None,
        "slug": "unregistered-room",
        "access_level": "public",
        "livekit": {
            "url": settings.LIVEKIT_CONFIGURATION["url"],
            "room": "unregistered-room",
            "token": livekit_token,
        },
    }
    mock_token.assert_called_once_with(
        room="unregistered-room",
        user=user,
        username=username,
        color=None,
        sources=None,
        role=None,
        participant_id=None,
    )


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_unregistered_allowed_not_normalized(mock_token, settings):
    """
    Joining an unregistered room by a slug that is not normalized should use
    the LiveKit room named after the url-safe slug.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = True

    response = APIClient().post(join_url("Réunion"), {}, format="json")

    assert response.status_code == 200
    assert response.json() == {
        "id": None,
        "slug": "reunion",
        "access_level": "public",
        "livekit": {
            "url": settings.LIVEKIT_CONFIGURATION["url"],
            "room": "reunion",
            "token": livekit_token,
        },
    }
    mock_token.assert_called_once_with(
        room="reunion",
        user=AnonymousUser(),
        username=None,
        color=None,
        sources=None,
        role=None,
        participant_id=None,
    )


def test_api_rooms_join_unregistered_token_claims(settings):
    """The token of an unregistered room should be scoped to it and carry the name."""
    settings.ALLOW_UNREGISTERED_ROOMS = True
    username = fake.user_name()

    response = APIClient().post(
        join_url("unregistered-room"), {"username": username}, format="json"
    )

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == username
    assert claims["video"]["room"] == "unregistered-room"


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_unregistered_not_allowed(mock_token, settings):
    """
    Joining an unregistered room should return a 404 if unregistered rooms
    are not allowed.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = False

    response = APIClient().post(join_url("unregistered-room"), {}, format="json")

    assert response.status_code == 404
    assert response.json() == {"detail": "No Room matches the given query."}
    mock_token.assert_not_called()


@pytest.mark.parametrize("lookup", ["---", "!!!", "_"])
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_unregistered_empty_slug(mock_token, lookup, settings):
    """
    Joining an unregistered room whose slug is empty once normalized should
    return a 404 rather than credentials for a room with no name.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = True

    response = APIClient().post(join_url(lookup), {}, format="json")

    assert response.status_code == 404
    assert response.json() == {"detail": "No Room matches the given query."}
    mock_token.assert_not_called()


@pytest.mark.parametrize("allow_unregistered_rooms", [True, False])
@pytest.mark.parametrize("lookup", ["id", "slug"])
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_soft_deleted(
    mock_token, lookup, allow_unregistered_rooms, settings
):
    """
    Joining a soft-deleted room should return a 410, and never fall back
    to an unregistered room with the same slug.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = allow_unregistered_rooms
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    room.soft_delete()

    response = APIClient().post(join_url(getattr(room, lookup)), {}, format="json")

    assert response.status_code == 410
    assert response.json() == {"detail": "This room has been deleted."}
    mock_token.assert_not_called()


@pytest.mark.parametrize(
    ("payload", "expected_username"),
    [
        ({"username": "Jean Bon"}, "Jean Bon"),
        ({"username": "  Jean Bon  "}, "Jean Bon"),
        ({"username": "x" * 255}, "x" * 255),
        ({}, None),
        ({"username": None}, None),
        ({"username": ""}, None),
        ({"username": "   "}, None),
    ],
)
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_username(mock_token, payload, expected_username):
    """
    The trimmed display name should be passed on to the token, a missing or
    blank one leaving the default name to the token generation.
    """
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(join_url(room.id), payload, format="json")

    assert response.status_code == 200
    assert response.json()["livekit"]["token"] == livekit_token
    assert mock_token.call_args.kwargs["username"] == expected_username


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_username_too_long(mock_token):
    """A display name exceeding 255 characters should be rejected."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(
        join_url(room.id), {"username": "a" * 256}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {
        "username": ["Ensure this field has no more than 255 characters."]
    }
    mock_token.assert_not_called()


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_username_in_query_string_ignored(mock_token):
    """The display name should only be read from the request body."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    username = fake.user_name()

    response = APIClient().post(
        f"{join_url(room.id)}?username={username}", {}, format="json"
    )

    assert response.status_code == 200
    assert mock_token.call_args.kwargs["username"] is None


def test_api_rooms_join_token_claims_anonymous():
    """The token should carry the submitted display name and be scoped to the room."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    username = fake.user_name()

    response = APIClient().post(
        join_url(room.id), {"username": username}, format="json"
    )

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == username
    assert claims["video"]["room"] == str(room.id)
    assert claims["video"]["roomAdmin"] is False


def test_api_rooms_join_token_claims_anonymous_default_name():
    """An anonymous user joining without a display name should get the default one."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(join_url(room.id), {"username": ""}, format="json")

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == "Anonymous"


def test_api_rooms_join_token_claims_owner():
    """The token of an owner should carry the submitted name and the room admin grant."""
    username = fake.user_name()
    user = UserFactory(full_name=fake.name())
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.post(join_url(room.id), {"username": username}, format="json")

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == username
    assert claims["sub"] == str(user.sub)
    assert claims["video"]["roomAdmin"] is True


def test_api_rooms_join_display_name_edit_disabled(settings):
    """
    An authenticated user should keep their account's name when display name
    edition is disabled, whatever name they submit.
    """
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False
    full_name = f"{fake.first_name()} {fake.last_name()}"
    user = UserFactory(full_name=full_name)
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()
    client.force_login(user)

    response = client.post(join_url(room.id), {"username": "Impostor"}, format="json")

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == full_name


def test_api_rooms_join_display_name_edit_disabled_anonymous(settings):
    """Anonymous users should still choose their display name when edition is disabled."""
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False
    username = fake.user_name()
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(
        join_url(room.id), {"username": username}, format="json"
    )

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == username


def test_api_rooms_join_session_without_csrf_token():
    """A session-authenticated request without a CSRF token should be rejected."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)

    response = client.post(join_url(room.id), {"username": "Jane"}, format="json")

    assert response.status_code == 403
    assert response.json()["detail"].startswith("CSRF Failed")


def test_api_rooms_join_session_with_csrf_token():
    """A session-authenticated request with a valid CSRF token should be accepted."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)
    csrf_secret = get_random_string(32)
    client.cookies[settings.CSRF_COOKIE_NAME] = csrf_secret

    response = client.post(
        join_url(room.id),
        {"username": "Jane"},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_secret,
    )

    assert response.status_code == 200
    assert "livekit" in response.json()


def test_api_rooms_join_session_with_csrf_token_foreign_origin():
    """A session-authenticated request from a foreign origin should be rejected."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)
    csrf_secret = get_random_string(32)
    client.cookies[settings.CSRF_COOKIE_NAME] = csrf_secret

    response = client.post(
        join_url(room.id),
        {"username": "Jane"},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_secret,
        HTTP_ORIGIN="https://evil.example",
    )

    assert response.status_code == 403
    assert response.json()["detail"].startswith("CSRF Failed: Origin checking failed")


def test_api_rooms_join_anonymous_without_csrf_token():
    """
    An anonymous request carries no ambient credential, so it should not be
    subject to CSRF checks.
    """
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient(enforce_csrf_checks=True)

    response = client.post(join_url(room.id), {"username": "Anonymous"}, format="json")

    assert response.status_code == 200
    assert "livekit" in response.json()


def test_api_rooms_join_user_access_token_without_csrf_token():
    """
    A request authenticated with a user access token carries no ambient
    credential, so it should not be subject to CSRF checks.
    """
    username = fake.user_name()
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, users=[(user, "owner")])
    client = APIClient(enforce_csrf_checks=True)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_user_access_token(user)}")

    response = client.post(join_url(room.id), {"username": username}, format="json")

    assert response.status_code == 200
    assert response.json()["pin_code"] == room.pin_code
    assert "accesses" in response.json()
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["sub"] == str(user.sub)
