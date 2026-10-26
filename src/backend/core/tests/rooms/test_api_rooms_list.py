"""
Test rooms API endpoints in the Meet core app: list.
"""

from datetime import timedelta
from unittest import mock

import pytest
from rest_framework.pagination import PageNumberPagination
from rest_framework.test import APIClient

from ... import models as models_module
from ...factories import RoomFactory, UserFactory
from ...models import RoleChoices, RoomAccessLevel
from ..utils import generate_user_access_token

pytestmark = pytest.mark.django_db


def test_api_rooms_list_anonymous():
    """Anonymous users should not be able to list rooms."""
    RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    RoomFactory(access_level=RoomAccessLevel.RESTRICTED)

    client = APIClient()

    response = client.get("/api/v1.0/rooms/")
    assert response.status_code == 200

    results = response.json()["results"]
    assert len(results) == 0


def test_api_rooms_list_authenticated():
    """
    Authenticated users listing rooms, should only see the rooms
    to which they are related.
    """
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    other_user = UserFactory()

    RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    room_user_accesses = RoomFactory(
        access_level=RoomAccessLevel.RESTRICTED, users=[user]
    )
    RoomFactory(access_level=RoomAccessLevel.RESTRICTED, users=[other_user])

    response = client.get(
        "/api/v1.0/rooms/",
    )

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    expected_ids = {
        str(room_user_accesses.id),
    }
    results_id = {result["id"] for result in results}
    assert expected_ids == results_id


@mock.patch.object(PageNumberPagination, "get_page_size", return_value=2)
def test_api_rooms_list_pagination(_mock_page_size):
    """Pagination should work as expected."""
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    rooms = RoomFactory.create_batch(3, users=[user])
    room_ids = [str(room.id) for room in rooms]

    response = client.get(
        "/api/v1.0/rooms/",
    )

    assert response.status_code == 200
    content = response.json()
    assert content["count"] == 3
    assert content["next"] == "http://testserver/api/v1.0/rooms/?page=2"
    assert content["previous"] is None

    assert len(content["results"]) == 2
    for item in content["results"]:
        room_ids.remove(item["id"])

    # Get page 2
    response = client.get(
        "/api/v1.0/rooms/?page=2",
    )

    assert response.status_code == 200
    content = response.json()

    assert content["count"] == 3
    assert content["next"] is None
    assert content["previous"], "http://testserver/api/v1.0/rooms/"

    assert len(content["results"]) == 1
    room_ids.remove(content["results"][0]["id"])
    assert room_ids == []


def test_api_rooms_list_authenticated_distinct():
    """A public room with several related users should only be listed once."""
    user = UserFactory()
    other_user = UserFactory()
    client = APIClient()
    client.force_login(user)

    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC, users=[user, other_user])

    response = client.get(
        "/api/v1.0/rooms/",
    )

    assert response.status_code == 200
    content = response.json()
    assert len(content["results"]) == 1
    assert content["results"][0]["id"] == str(room.id)


def test_api_rooms_list_pagination_page_size():
    """Users should be able to customize the number of results per page via page_size param."""
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    RoomFactory.create_batch(11, users=[user])

    response = client.get("/api/v1.0/rooms/?page_size=2")

    assert response.status_code == 200
    content = response.json()
    assert content["count"] == 11
    assert len(content["results"]) == 2
    assert content["next"] == "http://testserver/api/v1.0/rooms/?page=2&page_size=2"
    assert content["previous"] is None

    response = client.get("/api/v1.0/rooms/?page=6&page_size=2")

    assert response.status_code == 200
    content = response.json()
    assert content["count"] == 11
    assert len(content["results"]) == 1
    assert content["next"] is None
    assert content["previous"] == "http://testserver/api/v1.0/rooms/?page=5&page_size=2"

    response = client.get("/api/v1.0/rooms/?page_size=3")

    assert response.status_code == 200
    content = response.json()
    assert content["count"] == 11
    assert len(content["results"]) == 3
    assert content["next"] == "http://testserver/api/v1.0/rooms/?page=2&page_size=3"
    assert content["previous"] is None


def test_api_rooms_list_authenticated_with_user_access_token():
    """A user access token should list rooms exactly like a session would."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    RoomFactory()  # another user's room, not listed

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_user_access_token(user)}")
    response = client.get("/api/v1.0/rooms/")

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == str(room.id)


def test_api_rooms_list_filter_by_owner_role():
    """The role query param filters to rooms where the user holds that role."""
    user = UserFactory()
    other_user = UserFactory()
    client = APIClient()
    client.force_login(user)

    owned_room = RoomFactory(
        access_level=RoomAccessLevel.RESTRICTED, users=[(user, RoleChoices.OWNER)]
    )
    # A room the user administers but did not create must not show for ?role=owner.
    RoomFactory(users=[(user, RoleChoices.ADMIN)])
    # A room owned by someone else must not show either.
    RoomFactory(users=[(other_user, RoleChoices.OWNER)])

    response = client.get("/api/v1.0/rooms/?role=owner")

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["id"] == str(owned_room.id)
    assert results[0]["created_at"] is not None


def test_api_rooms_list_ordered_newest_first():
    """Rooms are listed newest-first (reverse chronological by created_at)."""
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    first_room = RoomFactory(users=[(user, RoleChoices.OWNER)])
    second_room = RoomFactory(users=[(user, RoleChoices.OWNER)])

    # Both were created in the same test tick; force a distinct order so the
    # assertion is deterministic regardless of DB timestamp granularity.
    models_module.Room.objects.filter(pk=first_room.pk).update(
        created_at=second_room.created_at - timedelta(days=1)
    )

    response = client.get("/api/v1.0/rooms/?role=owner")

    assert response.status_code == 200
    results = response.json()["results"]
    assert [r["id"] for r in results] == [str(second_room.id), str(first_room.id)]
