"""
Tests for external API /room endpoint
"""

# pylint: disable=W0621

from datetime import datetime, timedelta, timezone

from django.conf import settings

import jwt
import pytest
from rest_framework.test import APIClient

from core.factories import (
    RoomFactory,
    UserFactory,
)
from core.models import ApplicationScope, RoleChoices, Room

pytestmark = pytest.mark.django_db


def generate_test_token(user, scopes):
    """Generate a valid JWT token for testing."""
    now = datetime.now(timezone.utc)
    scope_string = " ".join(scopes)

    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(seconds=settings.APPLICATION_JWT_EXPIRATION_SECONDS),
        "client_id": "test-client-id",
        "scope": scope_string,
        "user_id": str(user.id),
        "delegated": True,
    }

    return jwt.encode(
        payload,
        settings.APPLICATION_JWT_SECRET_KEY,
        algorithm=settings.APPLICATION_JWT_ALG,
    )


def test_api_rooms_list_requires_authentication():
    """Listing rooms without authentication should return 401."""
    client = APIClient()
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 401


def test_api_rooms_list_with_valid_token(settings):
    """Listing rooms with valid token should succeed."""

    settings.APPLICATION_JWT_SECRET_KEY = "devKey"

    user = UserFactory()
    room = RoomFactory(users=[(user, RoleChoices.OWNER)])

    # Generate valid token
    token = generate_test_token(user, [ApplicationScope.ROOMS_LIST])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == str(room.id)


def test_api_rooms_list_with_expired_token(settings):
    """Listing rooms with expired token should return 401."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"
    settings.APPLICATION_JWT_EXPIRATION_SECONDS = 0

    user = UserFactory()

    # Generate expired token
    token = generate_test_token(user, [ApplicationScope.ROOMS_CREATE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 401
    assert "expired" in str(response.data).lower()


def test_api_rooms_list_with_invalid_token():
    """Listing rooms with invalid token should return 401."""
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token-123")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 401


def test_api_rooms_list_missing_scope(settings):
    """Listing rooms without required scope should return 403."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"

    user = UserFactory()

    # Token without ROOMS_LIST scope
    token = generate_test_token(user, [ApplicationScope.ROOMS_CREATE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 403
    assert "Insufficient permissions. Required scope: rooms:list" in str(response.data)


def test_api_rooms_list_filters_by_user(settings):
    """List should only return rooms accessible to the authenticated user."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"

    user1 = UserFactory()
    user2 = UserFactory()

    room1 = RoomFactory(users=[(user1, RoleChoices.OWNER)])
    room2 = RoomFactory(users=[(user2, RoleChoices.OWNER)])
    room3 = RoomFactory(users=[(user1, RoleChoices.MEMBER)])

    token = generate_test_token(user1, [ApplicationScope.ROOMS_LIST])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 200
    assert response.data["count"] == 2
    returned_ids = [r["id"] for r in response.data["results"]]
    assert str(room1.id) in returned_ids
    assert str(room3.id) in returned_ids
    assert str(room2.id) not in returned_ids


def test_api_rooms_retrieve_requires_scope(settings):
    """Retrieving a room requires ROOMS_RETRIEVE scope."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"

    user = UserFactory()
    room = RoomFactory(users=[(user, RoleChoices.OWNER)])

    # Token without ROOMS_RETRIEVE scope
    token = generate_test_token(user, [ApplicationScope.ROOMS_LIST])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room.id}/")

    assert response.status_code == 403
    assert "Insufficient permissions. Required scope: rooms:retrieve" in str(
        response.data
    )


def test_api_rooms_retrieve_success(settings):
    """Retrieving a room with correct scope should succeed."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"
    settings.APPLICATION_BASE_URL = "http://your-application.com"
    settings.ROOM_TELEPHONY_ENABLED = True
    settings.ROOM_TELEPHONY_PHONE_NUMBER = "+1-555-0100"
    settings.ROOM_TELEPHONY_DEFAULT_COUNTRY = "US"

    user = UserFactory()
    room = RoomFactory(users=[(user, RoleChoices.OWNER)])

    token = generate_test_token(user, [ApplicationScope.ROOMS_RETRIEVE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room.id}/")

    assert response.status_code == 200

    assert response.data == {
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
        "access_level": str(room.access_level),
        "url": f"http://your-application.com/{room.slug}",
        "telephony": {
            "enabled": True,
            "phone_number": "+1-555-0100",
            "pin_code": room.pin_code,
            "default_country": "US",
        },
    }


def test_api_rooms_create_requires_scope(settings):
    """Creating a room requires ROOMS_CREATE scope."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"
    user = UserFactory()

    # Token without ROOMS_CREATE scope
    token = generate_test_token(user, [ApplicationScope.ROOMS_LIST])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/rooms/", {}, format="json")

    assert response.status_code == 403
    assert "Insufficient permissions. Required scope: rooms:create" in str(
        response.data
    )


def test_api_rooms_create_success(settings):
    """Creating a room with correct scope should succeed."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"

    user = UserFactory()

    token = generate_test_token(user, [ApplicationScope.ROOMS_CREATE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/rooms/", {}, format="json")

    assert response.status_code == 201
    assert "id" in response.data
    assert "slug" in response.data

    # Verify room was created with user as owner
    room = Room.objects.get(id=response.data["id"])
    assert room.get_role(user) == RoleChoices.OWNER
    assert room.access_level == "trusted"


def test_api_rooms_response_no_url(settings):
    """Response should not include url field when APPLICATION_BASE_URL is None."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"
    settings.APPLICATION_BASE_URL = None

    user = UserFactory()
    room = RoomFactory(users=[(user, RoleChoices.OWNER)])

    token = generate_test_token(user, [ApplicationScope.ROOMS_RETRIEVE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room.id}/")

    assert response.status_code == 200
    assert "url" not in response.data
    assert response.data["id"] == str(room.id)


def test_api_rooms_response_no_telephony(settings):
    """Response should not include telephony field when ROOM_TELEPHONY_ENABLED is False."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"
    settings.ROOM_TELEPHONY_ENABLED = False

    user = UserFactory()
    room = RoomFactory(users=[(user, RoleChoices.OWNER)])

    token = generate_test_token(user, [ApplicationScope.ROOMS_RETRIEVE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room.id}/")

    assert response.status_code == 200
    assert "telephony" not in response.data
    assert response.data["id"] == str(room.id)


def test_api_rooms_token_without_delegated_flag(settings):
    """Token without delegated flag should be rejected."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"
    user = UserFactory()

    # Generate token without delegated flag
    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "client_id": "test-client",
        "scope": "rooms:list",
        "user_id": str(user.id),
        "delegated": False,  # Not delegated
    }
    token = jwt.encode(
        payload,
        settings.APPLICATION_JWT_SECRET_KEY,
        algorithm=settings.APPLICATION_JWT_ALG,
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 401
    assert "Invalid token type." in str(response.data)


def test_api_rooms_token_missing_client_id(settings):
    """Token without client_id should be rejected."""
    settings.APPLICATION_JWT_SECRET_KEY = "devKey"
    user = UserFactory()

    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "scope": "rooms:list",
        "user_id": str(user.id),
        "delegated": True,
        # Missing client_id
    }
    token = jwt.encode(
        payload,
        settings.APPLICATION_JWT_SECRET_KEY,
        algorithm=settings.APPLICATION_JWT_ALG,
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 401
    assert "Invalid token claims." in str(response.data)
