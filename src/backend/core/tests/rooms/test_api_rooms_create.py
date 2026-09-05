"""
Test rooms API endpoints in the Meet core app: create.
"""

# pylint: disable=redefined-outer-name,unused-argument
from django.conf import settings
from django.core.cache import cache

import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import Room, RoomAccessLevel

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


def test_api_rooms_create_authenticated_user_default_access_level():
    """
    The user's default room access level should be applied to the new room
    when the request does not provide one.
    """
    user = UserFactory(default_room_access_level=RoomAccessLevel.RESTRICTED)

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
    assert room.access_level == RoomAccessLevel.RESTRICTED


def test_api_rooms_create_authenticated_explicit_access_level_overrides_default():
    """
    An access level explicitly provided in the request should take precedence
    over the user's default room access level.
    """
    user = UserFactory(default_room_access_level=RoomAccessLevel.RESTRICTED)

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/rooms/",
        {
            "name": "my room",
            "access_level": RoomAccessLevel.TRUSTED,
        },
    )

    assert response.status_code == 201
    room = Room.objects.get()
    assert room.access_level == RoomAccessLevel.TRUSTED


def test_api_rooms_create_authenticated_no_user_default_access_level():
    """
    When the user has no default room access level, the instance default
    should be applied to the new room.
    """
    user = UserFactory(default_room_access_level=None)

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
    assert room.access_level == settings.RESOURCE_DEFAULT_ACCESS_LEVEL


def test_api_rooms_create_authenticated_user_default_configuration():
    """
    The user's default room configuration should be applied to the new room
    when the request does not provide one.
    """
    user = UserFactory(default_room_configuration={"everyone_can_mute": False})

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
    assert room.configuration == {"everyone_can_mute": False}


def test_api_rooms_create_authenticated_explicit_configuration_overrides_default():
    """
    A configuration explicitly provided in the request should take precedence
    over the user's default room configuration.
    """
    user = UserFactory(default_room_configuration={"everyone_can_mute": False})

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/rooms/",
        {
            "name": "my room",
            "configuration": {"can_publish_sources": ["camera", "microphone"]},
        },
        format="json",
    )

    assert response.status_code == 201
    room = Room.objects.get()
    assert room.configuration == {"can_publish_sources": ["camera", "microphone"]}


def test_api_rooms_create_authenticated_empty_configuration_falls_back_to_default():
    """
    An empty configuration in the request should not be considered an explicit
    value: the user's default room configuration should still be applied.
    """
    user = UserFactory(default_room_configuration={"everyone_can_mute": True})

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/rooms/",
        {
            "name": "my room",
            "configuration": {},
        },
        format="json",
    )

    assert response.status_code == 201
    room = Room.objects.get()
    assert room.configuration == {"everyone_can_mute": True}


def test_api_rooms_create_authenticated_empty_user_default_configuration():
    """
    When the user's default room configuration is empty, the new room should
    keep its default empty configuration.
    """
    user = UserFactory(default_room_configuration={})

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
    assert room.configuration == {}


def test_api_rooms_create_authenticated_request_precedence_over_user_empty():
    """
    When the user's default room configuration is empty, the request should take precedence.
    """
    user = UserFactory(default_room_configuration={})

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/rooms/",
        {"name": "my room", "configuration": {"everyone_can_mute": True}},
        format="json",
    )

    assert response.status_code == 201
    room = Room.objects.get()
    assert room.configuration == {"everyone_can_mute": True}


def test_api_rooms_create_authenticated_blank_user_default_access_level():
    """
    A blank default room access level (stored as an empty string) should be
    treated as unset: the instance default should be applied to the new room
    instead of persisting an invalid empty access level.
    """
    user = UserFactory(default_room_access_level="")

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
    assert room.access_level == settings.RESOURCE_DEFAULT_ACCESS_LEVEL


def test_api_rooms_create_public_not_allowed(settings):
    """Creating a public room should be rejected where the instance forbids them."""
    settings.ALLOW_PUBLIC_ROOMS = False
    client = APIClient()
    client.force_login(UserFactory())

    response = client.post(
        "/api/v1.0/rooms/",
        {"name": "my room", "access_level": RoomAccessLevel.PUBLIC},
        format="json",
    )

    assert response.status_code == 400
    assert not Room.objects.exists()


def test_api_rooms_create_public_user_default_not_allowed(settings, monkeypatch):
    """A user default saved before public rooms were forbidden should not create one."""
    settings.ALLOW_PUBLIC_ROOMS = False
    # The column default is read out of RESOURCE_DEFAULT_ACCESS_LEVEL at import,
    # and the boot guard holds that setting to a level the instance allows.
    column = Room._meta.get_field("access_level")
    monkeypatch.setattr(column, "default", RoomAccessLevel.TRUSTED)
    client = APIClient()
    client.force_login(UserFactory(default_room_access_level=RoomAccessLevel.PUBLIC))

    response = client.post("/api/v1.0/rooms/", {"name": "my room"}, format="json")

    assert response.status_code == 201
    assert Room.objects.get().access_level == RoomAccessLevel.TRUSTED
