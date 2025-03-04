"""
Test rooms API endpoints in the Meet core app: list.
"""

from unittest import mock

import pytest
from rest_framework.pagination import PageNumberPagination
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import RoomAccessLevel

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
