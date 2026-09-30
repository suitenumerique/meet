"""
Test rooms API endpoints in the Meet core app: create.
"""

# pylint: disable=redefined-outer-name,unused-argument
from django.conf import settings
from django.core.cache import cache

import pytest
from rest_framework.test import APIClient

from ...api.throttling import (
    RoomCreationDailyUserRateThrottle,
    RoomCreationUserRateThrottle,
)
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


def test_api_rooms_create_authenticated_slug_held_by_soft_deleted_room():
    """
    A deleted room keeps its slug: creating a room with the same name should
    fail validation rather than hit the database constraint.
    """
    RoomFactory(name="my room").soft_delete()
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
    assert Room.all_objects.count() == 1


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


@pytest.fixture
def room_creation_throttle(monkeypatch):
    """Lower the room creation rate for the duration of a test."""
    monkeypatch.setitem(
        settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "room_creation", "2/minute"
    )


def test_api_rooms_create_throttled(room_creation_throttle):
    """Excess requests are rejected and create no room."""

    client = APIClient()
    client.force_login(UserFactory())

    for index in range(2):
        response = client.post("/api/v1.0/rooms/", {"name": f"Room {index}"})
        assert response.status_code == 201

    response = client.post("/api/v1.0/rooms/", {"name": "Blocked room"})
    assert response.status_code == 429
    assert 0 < int(response["Retry-After"]) <= 60
    assert Room.objects.count() == 2


def test_api_rooms_create_throttle_per_user(room_creation_throttle):
    """Users sharing an IP have independent creation limits."""

    client = APIClient()
    client.force_login(UserFactory())
    for index in range(2):
        response = client.post("/api/v1.0/rooms/", {"name": f"First user room {index}"})
        assert response.status_code == 201

    response = client.post("/api/v1.0/rooms/", {"name": "Blocked room"})
    assert response.status_code == 429

    client.force_login(UserFactory())
    response = client.post("/api/v1.0/rooms/", {"name": "Second user room"})
    assert response.status_code == 201


def test_api_rooms_create_throttle_does_not_limit_other_actions(room_creation_throttle):
    """Exhausting creation capacity leaves listing and updating available."""

    client = APIClient()
    client.force_login(UserFactory())
    for index in range(2):
        response = client.post("/api/v1.0/rooms/", {"name": f"Room {index}"})
        assert response.status_code == 201
    room_id = response.json()["id"]

    assert client.post("/api/v1.0/rooms/", {"name": "Blocked room"}).status_code == 429
    assert client.get("/api/v1.0/rooms/").status_code == 200
    assert (
        client.patch(
            f"/api/v1.0/rooms/{room_id}/", {"name": "Renamed room"}
        ).status_code
        == 200
    )


@pytest.fixture
def daily_room_creation_throttle(monkeypatch):
    """Use a tiny daily cap, a loose burst limit and a controllable clock.

    Rates are patched with monkeypatch.setitem so they are restored after the
    test. Returns a one-item list holding the current fake timestamp.
    """
    rates = RoomCreationDailyUserRateThrottle.THROTTLE_RATES
    monkeypatch.setitem(rates, "room_creation", "100/minute")
    monkeypatch.setitem(rates, "room_creation_daily", "3/day")
    now = [1_000_000.0]
    monkeypatch.setattr(RoomCreationUserRateThrottle, "timer", lambda self: now[0])
    return now


def test_api_rooms_create_daily_throttled(daily_room_creation_throttle):
    """The daily cap still applies once the short-term window has elapsed."""
    now = daily_room_creation_throttle
    client = APIClient()
    client.force_login(UserFactory())

    for index in range(3):
        response = client.post("/api/v1.0/rooms/", {"name": f"Room {index}"})
        assert response.status_code == 201
        now[0] += 120  # Spread creations beyond the short-term window.

    response = client.post("/api/v1.0/rooms/", {"name": "Blocked room"})
    assert response.status_code == 429
    assert int(response["Retry-After"]) > 60
    assert Room.objects.count() == 3


def test_api_rooms_create_daily_throttle_resets(daily_room_creation_throttle):
    """Room creation is allowed again once a day has passed."""
    now = daily_room_creation_throttle
    client = APIClient()
    client.force_login(UserFactory())

    for index in range(3):
        response = client.post("/api/v1.0/rooms/", {"name": f"Room {index}"})
        assert response.status_code == 201

    response = client.post("/api/v1.0/rooms/", {"name": "Blocked room"})
    assert response.status_code == 429

    now[0] += 24 * 60 * 60 + 1
    response = client.post("/api/v1.0/rooms/", {"name": "Next day room"})
    assert response.status_code == 201


def test_api_rooms_create_daily_throttle_per_user(daily_room_creation_throttle):
    """Each user has its own daily cap."""
    client = APIClient()
    client.force_login(UserFactory())
    for index in range(3):
        response = client.post("/api/v1.0/rooms/", {"name": f"Room {index}"})
        assert response.status_code == 201
    assert client.post("/api/v1.0/rooms/", {"name": "Blocked"}).status_code == 429

    client.force_login(UserFactory())
    response = client.post("/api/v1.0/rooms/", {"name": "Other user room"})
    assert response.status_code == 201


def test_api_rooms_create_daily_throttle_does_not_limit_other_actions(
    daily_room_creation_throttle,
):
    """Reaching the daily cap leaves listing and updating available."""
    client = APIClient()
    client.force_login(UserFactory())
    for index in range(3):
        response = client.post("/api/v1.0/rooms/", {"name": f"Room {index}"})
        assert response.status_code == 201
    room_id = response.json()["id"]

    assert client.post("/api/v1.0/rooms/", {"name": "Blocked"}).status_code == 429
    assert client.get("/api/v1.0/rooms/").status_code == 200
    response = client.patch(f"/api/v1.0/rooms/{room_id}/", {"name": "Renamed"})
    assert response.status_code == 200
