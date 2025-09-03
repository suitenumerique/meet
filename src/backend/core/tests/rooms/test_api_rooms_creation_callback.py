"""
Test rooms API endpoints in the Meet core app: creation callback functionality.
"""

# pylint: disable=redefined-outer-name,unused-argument
from django.core.cache import cache

import pytest
from rest_framework.test import APIClient

from ...factories import UserFactory

pytestmark = pytest.mark.django_db


# Tests for creation_callback endpoint


@pytest.fixture
def reset_cache():
    """Provide cache cleanup after each test to maintain test isolation."""
    yield
    keys = cache.keys("room-creation-callback_*")
    if keys:
        cache.delete(*keys)


def test_api_rooms_create_anonymous(reset_cache):
    """Anonymous user can retrieve room data once using a valid callback ID."""
    client = APIClient()
    cache.set("room-creation-callback_123", {"slug": "my room"})
    response = client.post(
        "/api/v1.0/rooms/creation-callback/",
        {
            "callback_id": "123",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success", "room": {"slug": "my room"}}

    # Data should be cleared after retrieval
    response = client.post(
        "/api/v1.0/rooms/creation-callback/",
        {
            "callback_id": "123",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success", "room": {}}


def test_api_rooms_create_empty_cache():
    """Valid callback ID return empty room data when nothing is stored in the cache."""
    client = APIClient()

    response = client.post(
        "/api/v1.0/rooms/creation-callback/",
        {
            "callback_id": "123",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success", "room": {}}


def test_api_rooms_create_missing_callback_id():
    """Requests without a callback ID properly fail with a 400 status code."""
    client = APIClient()

    response = client.post(
        "/api/v1.0/rooms/creation-callback/",
        {},
    )

    assert response.status_code == 400


def test_api_rooms_create_authenticated(reset_cache):
    """Authenticated users can also successfully retrieve room data using a valid callback ID"""
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    cache.set("room-creation-callback_123", {"slug": "my room"})

    response = client.post(
        "/api/v1.0/rooms/creation-callback/",
        {
            "callback_id": "123",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success", "room": {"slug": "my room"}}
