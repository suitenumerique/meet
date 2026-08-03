"""
Test rooms API endpoints in the Meet core app: create.
"""

from datetime import datetime, timedelta, timezone

from django.conf import settings as django_settings

# pylint: disable=redefined-outer-name,unused-argument
from django.core.cache import cache

import jwt
import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import Room

pytestmark = pytest.mark.django_db


@pytest.fixture
def reset_cache():
    """Provide cache cleanup after each test to maintain test isolation."""
    yield
    keys = cache.keys("room-creation-callback_*")
    if keys:
        cache.delete(*keys)


def test_api_rooms_create_anonymous():
    """Anonymous users should not be allowed to create rooms."""
    client = APIClient()

    response = client.post(
        "/api/v1.0/rooms/",
        {
            "name": "my room",
        },
    )

    assert response.status_code == 401
    assert Room.objects.exists() is False


def test_api_rooms_create_authenticated(reset_cache):
    """
    Authenticated users should be able to create rooms and should automatically be declared
    as owner of the newly created room.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/rooms/",
        {
            "name": "my room",
        },
    )

    assert response.status_code == 201
    room = Room.objects.get()
    assert room.name == "my room"
    assert room.slug == "my-room"
    assert room.accesses.filter(role="owner", user=user).exists() is True

    rooms_data = cache.keys("room-creation-callback_*")
    assert not rooms_data


def test_api_rooms_create_generation_cache(reset_cache):
    """
    Authenticated users creating a room with a callback ID should have room data stored in cache.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/rooms/",
        {"name": "my room", "callback_id": "1234"},
    )

    assert response.status_code == 201
    room = Room.objects.get()
    assert room.name == "my room"
    assert room.slug == "my-room"
    assert room.accesses.filter(role="owner", user=user).exists() is True

    room_data = cache.get("room-creation-callback_1234")
    assert room_data.get("slug") == "my-room"


def test_api_rooms_create_authenticated_existing_slug():
    """
    A user trying to create a room with a name that translates to a slug that already exists
    should receive a 400 error.
    """
    RoomFactory(name="my room")
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/rooms/",
        {
            "name": "My Room!",
        },
    )

    assert response.status_code == 400
    assert response.json() == {"slug": ["Room with this Slug already exists."]}


def generate_user_access_token(user):
    """Generate a valid user access JWT signed with the token secret."""
    now = datetime.now(timezone.utc)

    payload = {
        "iss": django_settings.USER_ACCESS_TOKEN_ISSUER,
        "aud": django_settings.USER_ACCESS_TOKEN_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(seconds=django_settings.USER_ACCESS_TOKEN_TTL),
        "user_id": str(user.id),
        "token_type": "user_access",
        "client_id": "test-app",
        "scope": "user:access",
    }

    return jwt.encode(
        payload,
        django_settings.USER_ACCESS_TOKEN_SECRET_KEY,
        algorithm=django_settings.USER_ACCESS_TOKEN_ALG,
    )


def test_api_rooms_create_authenticated_with_user_access_token():
    """A user access token should create a room exactly like a session would."""
    user = UserFactory()

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_user_access_token(user)}")
    response = client.post("/api/v1.0/rooms/", {"name": "my room"})

    assert response.status_code == 201
    room = Room.objects.get()
    assert room.accesses.filter(role="owner", user=user).exists()
