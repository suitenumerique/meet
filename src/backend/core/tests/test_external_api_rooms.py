"""
Tests for external API /room endpoint
"""

# pylint: disable=W0621,C0302

import uuid
from datetime import datetime, timedelta, timezone
from unittest import mock

from django.conf import settings

import jwt
import pytest
import responses
from lasuite.oidc_resource_server.authentication import ResourceServerAuthentication
from rest_framework.test import APIClient

from core.factories import ApplicationFactory, RoomFactory, UserFactory
from core.models import ApplicationScope, RoleChoices, Room, RoomAccessLevel, User

pytestmark = pytest.mark.django_db


def generate_test_token(user, scopes):
    """Generate a valid JWT token for testing."""
    now = datetime.now(timezone.utc)
    scope_string = " ".join(scopes)

    application = ApplicationFactory()

    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(seconds=settings.APPLICATION_JWT_EXPIRATION_SECONDS),
        "client_id": str(application.client_id),
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


def test_api_rooms_list_inactive_user():
    """List should return 401 if user is inactive."""

    user1 = UserFactory(is_active=False)
    RoomFactory(users=[(user1, RoleChoices.OWNER)])

    token = generate_test_token(user1, [ApplicationScope.ROOMS_LIST])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 401
    assert "user account is disabled" in str(response.data).lower()


def test_api_rooms_list_with_valid_token():
    """Listing rooms with valid token should succeed."""

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


def test_api_rooms_list_with_no_rooms():
    """Listing rooms with a valid token returns an empty list when there are no rooms."""

    user = UserFactory()

    # Generate valid token
    token = generate_test_token(user, [ApplicationScope.ROOMS_LIST])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 200
    assert response.data["count"] == 0
    assert response.data["results"] == []


def test_api_rooms_list_with_expired_token(settings):
    """Listing rooms with expired token should return 401."""
    settings.APPLICATION_JWT_EXPIRATION_SECONDS = 0

    user = UserFactory()

    # Generate expired token
    token = generate_test_token(user, [ApplicationScope.ROOMS_CREATE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 401
    assert "expired" in str(response.data).lower()


@responses.activate
def test_api_rooms_list_with_invalid_rs_token(settings):
    """Listing rooms with invalid resource server token should return 400."""

    settings.OIDC_OP_INTROSPECTION_ENDPOINT = "https://oidc.example.com/introspect"
    settings.OIDC_OP_URL = "https://oidc.example.com"

    responses.add(
        responses.POST,
        "https://oidc.example.com/introspect",
        json={
            "iss": "https://oidc.example.com",
            "active": False,
        },
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token-123")
    response = client.get("/external-api/v1.0/rooms/")

    # Return 400 instead of 401 because ResourceServerAuthentication raises
    # SuspiciousOperation when the introspected user is not active
    assert response.status_code == 400


def test_api_rooms_list_missing_scope():
    """Listing rooms without required scope should return 403."""

    user = UserFactory()

    # Token without ROOMS_LIST scope
    token = generate_test_token(user, [ApplicationScope.ROOMS_CREATE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 403
    assert (
        "insufficient permissions. required scope: rooms:list"
        in str(response.data).lower()
    )


def test_api_rooms_list_no_scope():
    """Listing rooms without any scope should return 403."""

    user = UserFactory()

    # Token without scope
    token = generate_test_token(user, [])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 403
    assert "insufficient permissions." in str(response.data).lower()


def test_api_rooms_list_filters_by_user():
    """List should only return rooms accessible to the authenticated user."""

    user1 = UserFactory()
    user2 = UserFactory()

    room1 = RoomFactory(users=[(user1, RoleChoices.OWNER)])
    room2 = RoomFactory(users=[(user2, RoleChoices.OWNER)])
    room3 = RoomFactory(users=[(user1, RoleChoices.MEMBER)])

    token = generate_test_token(
        user1, [ApplicationScope.ROOMS_LIST, ApplicationScope.ROOMS_CREATE]
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 200
    assert response.data["count"] == 2
    returned_ids = [r["id"] for r in response.data["results"]]
    assert str(room1.id) in returned_ids
    assert str(room3.id) in returned_ids
    assert str(room2.id) not in returned_ids


def test_api_rooms_retrieve_requires_authentication():
    """Retrieving rooms without authentication should return 401."""

    user1 = UserFactory()
    room1 = RoomFactory(users=[(user1, RoleChoices.OWNER)])

    client = APIClient()
    response = client.get(f"/external-api/v1.0/rooms/{room1.id}/")

    assert response.status_code == 401


def test_api_rooms_retrieve_inactive_user():
    """Retrieve should return 401 if user is inactive."""

    user1 = UserFactory(is_active=False)
    room1 = RoomFactory(users=[(user1, RoleChoices.OWNER)])

    token = generate_test_token(user1, [ApplicationScope.ROOMS_LIST])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room1.id}/")

    assert response.status_code == 401
    assert "user account is disabled" in str(response.data).lower()


def test_api_rooms_retrieve_with_expired_token(settings):
    """Retrieving rooms with expired token should return 401."""
    settings.APPLICATION_JWT_EXPIRATION_SECONDS = 0

    user = UserFactory()
    room = RoomFactory(users=[(user, RoleChoices.OWNER)])

    # Generate expired token
    token = generate_test_token(user, [ApplicationScope.ROOMS_CREATE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room.id}/")

    assert response.status_code == 401
    assert "expired" in str(response.data).lower()


@responses.activate
def test_api_rooms_retrieve_with_invalid_rs_token(settings):
    """Retrieving rooms with invalid resource server token should return 400."""

    settings.OIDC_OP_INTROSPECTION_ENDPOINT = "https://oidc.example.com/introspect"
    settings.OIDC_OP_URL = "https://oidc.example.com"

    responses.add(
        responses.POST,
        "https://oidc.example.com/introspect",
        json={
            "iss": "https://oidc.example.com",
            "active": False,
        },
    )

    user = UserFactory()
    room = RoomFactory(users=[(user, RoleChoices.OWNER)])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token-123")
    response = client.get(f"/external-api/v1.0/rooms/{room.id}/")

    # Return 400 instead of 401 because ResourceServerAuthentication raises
    # SuspiciousOperation when the introspected user is not active
    assert response.status_code == 400


def test_api_rooms_retrieve_requires_scope():
    """Retrieving a room requires ROOMS_RETRIEVE scope."""

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


def test_api_rooms_retrieve_no_scope():
    """Retrieving rooms without any scope should return 403."""

    user = UserFactory()

    # Token without scope
    token = generate_test_token(user, [])
    room = RoomFactory(users=[(user, RoleChoices.OWNER)])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room.id}/")

    assert response.status_code == 403
    assert "insufficient permissions." in str(response.data).lower()


def test_api_rooms_retrieve_success(settings):
    """Retrieving a room with correct scope should succeed."""
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


def test_api_rooms_retrieve_success_by_user():
    """Retrieve should only return rooms accessible to the authenticated user."""

    user1 = UserFactory()
    user2 = UserFactory()

    room1 = RoomFactory(users=[(user1, RoleChoices.OWNER)])
    room2 = RoomFactory(users=[(user2, RoleChoices.OWNER)])
    room3 = RoomFactory(users=[(user1, RoleChoices.MEMBER)])
    room4 = RoomFactory(users=[(user1, RoleChoices.ADMIN)])

    token = generate_test_token(
        user1, [ApplicationScope.ROOMS_RETRIEVE, ApplicationScope.ROOMS_LIST]
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room2.id}/")

    assert response.status_code == 403

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room1.id}/")

    assert response.status_code == 200

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room3.id}/")

    assert response.status_code == 200

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{room4.id}/")

    assert response.status_code == 200


def test_api_rooms_retrieve_not_found():
    """Retrieving a non-existing room with correct scope should return a 404."""

    user = UserFactory()
    token = generate_test_token(user, [ApplicationScope.ROOMS_RETRIEVE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(f"/external-api/v1.0/rooms/{uuid.uuid4()}/")

    assert response.status_code == 404
    assert "no room matches the given query." in str(response.data).lower()


def test_api_rooms_create_requires_authentication():
    """Creating rooms without authentication should return 401."""

    client = APIClient()
    response = client.post("/external-api/v1.0/rooms/")

    assert response.status_code == 401


def test_api_rooms_create_with_expired_token(settings):
    """Creating rooms with expired token should return 401."""
    settings.APPLICATION_JWT_EXPIRATION_SECONDS = 0

    user = UserFactory()

    # Generate expired token
    token = generate_test_token(user, [ApplicationScope.ROOMS_CREATE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/rooms/")

    assert response.status_code == 401
    assert "expired" in str(response.data).lower()


@responses.activate
def test_api_rooms_create_with_invalid_rs_token(settings):
    """Creating rooms with invalid resource server token should return 400."""

    settings.OIDC_OP_INTROSPECTION_ENDPOINT = "https://oidc.example.com/introspect"
    settings.OIDC_OP_URL = "https://oidc.example.com"

    responses.add(
        responses.POST,
        "https://oidc.example.com/introspect",
        json={
            "iss": "https://oidc.example.com",
            "active": False,
        },
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token-123")
    response = client.post("/external-api/v1.0/rooms/")

    # Return 400 instead of 401 because ResourceServerAuthentication raises
    # SuspiciousOperation when the introspected user is not active
    assert response.status_code == 400


def test_api_rooms_create_inactive_user():
    """Create should return 401 if user is inactive."""

    user1 = UserFactory(is_active=False)

    token = generate_test_token(user1, [ApplicationScope.ROOMS_CREATE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/rooms/")

    assert response.status_code == 401
    assert "user account is disabled" in str(response.data).lower()


def test_api_rooms_create_requires_scope():
    """Creating a room requires ROOMS_CREATE scope."""
    user = UserFactory()

    # Token without ROOMS_CREATE scope
    token = generate_test_token(user, [ApplicationScope.ROOMS_LIST])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/rooms/", {}, format="json")

    assert response.status_code == 403
    assert (
        "insufficient permissions. required scope: rooms:create"
        in str(response.data).lower()
    )


def test_api_rooms_create_no_scope():
    """Creating rooms without any scope should return 403."""

    user = UserFactory()

    # Token without scope
    token = generate_test_token(user, [])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/rooms/")

    assert response.status_code == 403
    assert "insufficient permissions." in str(response.data).lower()


def test_api_rooms_create_success():
    """Creating a room with correct scope should succeed."""

    user = UserFactory()

    token = generate_test_token(
        user, [ApplicationScope.ROOMS_CREATE, ApplicationScope.ROOMS_LIST]
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post("/external-api/v1.0/rooms/", {}, format="json")

    assert response.status_code == 201
    assert "id" in response.data
    assert "slug" in response.data
    assert "name" in response.data
    assert response.data["name"] == response.data["slug"]

    # Verify room was created with user as owner
    room = Room.objects.get(id=response.data["id"])
    assert room.get_role(user) == RoleChoices.OWNER
    assert room.access_level == "trusted"


def test_api_rooms_create_readonly_enforcement():
    """Creating a room succeeds and any provided read-only fields are ignored."""

    user = UserFactory()

    token = generate_test_token(user, [ApplicationScope.ROOMS_CREATE])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(
        "/external-api/v1.0/rooms/",
        {
            "id": "fake-id",
            "slug": "fake-slug",
            "name": "fake-name",
            "access_level": "public",
        },
        format="json",
    )

    assert response.status_code == 201
    assert "slug" in response.data
    assert response.data["id"] != "fake-id"
    assert "name" in response.data
    assert response.data["slug"] != "fake-slug"
    assert "id" in response.data
    assert response.data["name"] != "fake-name"

    # Verify room was created with user as owner
    room = Room.objects.get(id=response.data["id"])
    assert room.get_role(user) == RoleChoices.OWNER
    assert room.access_level == "trusted"


def test_api_rooms_unknown_actions():
    """Updating or deleting a room are not supported yet."""

    user = UserFactory()
    room = RoomFactory(users=[(user, RoleChoices.OWNER)])

    token = generate_test_token(
        user,
        [
            ApplicationScope.ROOMS_RETRIEVE,
            ApplicationScope.ROOMS_DELETE,
            ApplicationScope.ROOMS_UPDATE,
        ],
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.delete(f"/external-api/v1.0/rooms/{room.id}/")

    assert response.status_code == 405
    assert 'method "delete" not allowed.' in str(response.data).lower()

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.patch(f"/external-api/v1.0/rooms/{room.id}/")

    assert response.status_code == 405
    assert 'method "patch" not allowed.' in str(response.data).lower()


def test_api_rooms_response_no_url(settings):
    """Response should not include url field when APPLICATION_BASE_URL is None."""
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


def test_api_rooms_token_scope_case_insensitive(settings):
    """Token's scope should be case-insensitive."""
    user = UserFactory()
    application = ApplicationFactory()

    # Generate token with mixed-case scope "Rooms:List" to verify that scope
    # validation is case-insensitive (should match "rooms:list")
    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "client_id": str(application.client_id),
        "scope": "Rooms:List",  # Mixed case - should be accepted as "rooms:list"
        "user_id": str(user.id),
        "delegated": True,
    }
    token = jwt.encode(
        payload,
        settings.APPLICATION_JWT_SECRET_KEY,
        algorithm=settings.APPLICATION_JWT_ALG,
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 200


def test_api_rooms_token_without_delegated_flag(settings):
    """Token without delegated flag should be rejected."""
    user = UserFactory()
    application = ApplicationFactory()

    # Generate token without delegated flag
    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "client_id": str(application.client_id),
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
    assert "invalid token type." in str(response.data).lower()


@mock.patch.object(ResourceServerAuthentication, "authenticate", return_value=None)
def test_api_rooms_token_invalid_signature(mock_rs_authenticate, settings):
    """Token signed with an invalid key should defer to the next authentication."""
    user = UserFactory()
    application = ApplicationFactory()

    # Generate token without delegated flag
    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "client_id": str(application.client_id),
        "scope": "rooms:list",
        "user_id": str(user.id),
        "delegated": True,
    }
    token = jwt.encode(
        payload,
        "invalid-private-key",
        algorithm=settings.APPLICATION_JWT_ALG,
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    mock_rs_authenticate.assert_called()
    assert response.status_code == 401


@mock.patch.object(ResourceServerAuthentication, "authenticate", return_value=None)
def test_api_rooms_token_invalid_alg(mock_rs_authenticate, settings):
    """Token signed with an invalid alg should defer to the next authentication."""
    settings.APPLICATION_JWT_ALG = "RS256"
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
        "delegated": True,
    }
    token = jwt.encode(
        payload,
        settings.APPLICATION_JWT_SECRET_KEY,
        algorithm="HS256",  # different value
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/external-api/v1.0/rooms/")

    mock_rs_authenticate.assert_called()
    assert response.status_code == 401


def test_api_rooms_token_missing_client_id(settings):
    """Token without client_id should be rejected."""
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
    assert "invalid token claims." in str(response.data).lower()


def test_api_rooms_token_missing_user_id(settings):
    """Token without user_id should be rejected."""
    application = ApplicationFactory()

    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "client_id": str(application.client_id),
        "scope": "rooms:list",
        "delegated": True,
        # Missing user_id
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
    assert "invalid token claims." in str(response.data).lower()


def test_api_rooms_token_invalid_audience(settings):
    """Token with an invalid audience should be rejected."""
    user = UserFactory()
    application = ApplicationFactory()

    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": "invalid-audience",
        "iat": now,
        "exp": now + timedelta(hours=1),
        "client_id": str(application.client_id),
        "user_id": str(user.id),
        "scope": "rooms:list",
        "delegated": True,
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
    assert "invalid token." in str(response.data).lower()


def test_api_rooms_token_unknown_user(settings):
    """Token for unknown user should be rejected."""
    application = ApplicationFactory()

    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "client_id": str(application.client_id),
        "user_id": str(uuid.uuid4()),
        "scope": "rooms:list",
        "delegated": True,
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
    assert "user not found." in str(response.data).lower()


def test_api_rooms_token_unknown_application(settings):
    """Token for unknown application should be rejected."""

    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "client_id": "unknown-client-id",
        "user_id": str(uuid.uuid4()),
        "scope": "rooms:list",
        "delegated": True,
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
    assert "application not found." in str(response.data).lower()


def test_api_rooms_token_inactive_application(settings):
    """Token for inactive application should be rejected."""
    application = ApplicationFactory(active=False)

    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.APPLICATION_JWT_ISSUER,
        "aud": settings.APPLICATION_JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "client_id": str(application.client_id),
        "user_id": str(uuid.uuid4()),
        "scope": "rooms:list",
        "delegated": True,
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
    assert "application is disabled." in str(response.data).lower()


@responses.activate
def test_resource_server_creates_user_on_first_authentication(settings):
    """New user should be created during first authentication.

    Verifies that the ResourceServerBackend.get_or_create_user() creates a user
    in the database when authenticating with a token from an unknown subject (sub).
    This tests the user creation workflow during the OIDC introspection process.
    """

    with pytest.raises(
        User.DoesNotExist,
        match="User matching query does not exist.",
    ):
        User.objects.get(sub="very-specific-sub")

    assert (
        settings.OIDC_RS_BACKEND_CLASS
        == "core.external_api.authentication.ResourceServerBackend"
    )

    settings.OIDC_RS_CLIENT_ID = "some_client_id"
    settings.OIDC_RS_CLIENT_SECRET = "some_client_secret"
    settings.OIDC_RS_SCOPES_PREFIX = "lasuite_meet"

    settings.OIDC_OP_URL = "https://oidc.example.com"
    settings.OIDC_VERIFY_SSL = False
    settings.OIDC_TIMEOUT = 5
    settings.OIDC_PROXY = None
    settings.OIDC_OP_JWKS_ENDPOINT = "https://oidc.example.com/jwks"
    settings.OIDC_OP_INTROSPECTION_ENDPOINT = "https://oidc.example.com/introspect"

    responses.add(
        responses.POST,
        "https://oidc.example.com/introspect",
        json={
            "iss": "https://oidc.example.com",
            "aud": "some_client_id",  # settings.OIDC_RS_CLIENT_ID
            "sub": "very-specific-sub",
            "client_id": "some_service_provider",
            "scope": "openid lasuite_meet lasuite_meet:rooms:list",
            "active": True,
        },
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer some_token")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 200

    results = response.json()["results"]
    assert len(results) == 0

    db_user = User.objects.get(sub="very-specific-sub")
    assert db_user is not None
    assert db_user.email is None


@responses.activate
def test_resource_server_skips_user_creation_when_auto_creation_disabled(settings):
    """Verify that ResourceServerBackend respects the user auto-creation setting.

    This ensures that the OIDC introspection process respects the configuration flag
    that controls whether new users should be automatically provisioned during
    authentication, preventing unwanted user proliferation when auto-creation is
    explicitly disabled.
    """

    settings.OIDC_CREATE_USER = False

    with pytest.raises(
        User.DoesNotExist,
        match="User matching query does not exist.",
    ):
        User.objects.get(sub="very-specific-sub")

    assert (
        settings.OIDC_RS_BACKEND_CLASS
        == "core.external_api.authentication.ResourceServerBackend"
    )

    settings.OIDC_RS_CLIENT_ID = "some_client_id"
    settings.OIDC_RS_CLIENT_SECRET = "some_client_secret"

    settings.OIDC_OP_URL = "https://oidc.example.com"
    settings.OIDC_VERIFY_SSL = False
    settings.OIDC_TIMEOUT = 5
    settings.OIDC_PROXY = None
    settings.OIDC_OP_JWKS_ENDPOINT = "https://oidc.example.com/jwks"
    settings.OIDC_OP_INTROSPECTION_ENDPOINT = "https://oidc.example.com/introspect"

    responses.add(
        responses.POST,
        "https://oidc.example.com/introspect",
        json={
            "iss": "https://oidc.example.com",
            "aud": "some_client_id",  # settings.OIDC_RS_CLIENT_ID
            "sub": "very-specific-sub",
            "client_id": "some_service_provider",
            "scope": "openid lasuite_meet rooms:list",
            "active": True,
        },
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer some_token")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 401


@responses.activate
def test_resource_server_authentication_successful(settings):
    """Authenticated requests should be processed and user-specific data is returned.

    Verifies that once a user is authenticated via OIDC token introspection,
    the API correctly identifies the user and returns only data accessible to that user
    (e.g., rooms with appropriate access levels).
    """

    user = UserFactory(sub="very-specific-sub")

    other_user = UserFactory()

    RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    room_user_accesses = RoomFactory(
        access_level=RoomAccessLevel.RESTRICTED, users=[user]
    )
    RoomFactory(access_level=RoomAccessLevel.RESTRICTED, users=[other_user])

    assert (
        settings.OIDC_RS_BACKEND_CLASS
        == "core.external_api.authentication.ResourceServerBackend"
    )

    settings.OIDC_RS_CLIENT_ID = "some_client_id"
    settings.OIDC_RS_CLIENT_SECRET = "some_client_secret"
    settings.OIDC_RS_SCOPES_PREFIX = "lasuite_meet"

    settings.OIDC_OP_URL = "https://oidc.example.com"
    settings.OIDC_VERIFY_SSL = False
    settings.OIDC_TIMEOUT = 5
    settings.OIDC_PROXY = None
    settings.OIDC_OP_JWKS_ENDPOINT = "https://oidc.example.com/jwks"
    settings.OIDC_OP_INTROSPECTION_ENDPOINT = "https://oidc.example.com/introspect"

    responses.add(
        responses.POST,
        "https://oidc.example.com/introspect",
        json={
            "iss": "https://oidc.example.com",
            "aud": "some_client_id",  # settings.OIDC_RS_CLIENT_ID
            "sub": "very-specific-sub",
            "client_id": "some_service_provider",
            "scope": "openid lasuite_meet lasuite_meet:rooms:list lasuite_meet:rooms:retrieve",
            "active": True,
        },
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer some_token")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    expected_ids = {
        str(room_user_accesses.id),
    }
    results_id = {result["id"] for result in results}
    assert expected_ids == results_id


@responses.activate
def test_resource_server_denies_access_with_insufficient_scopes(settings):
    """Requests should be denied when the token lacks required scopes.

    Verifies that the ResourceServerBackend validates token scopes during introspection
    and returns 403 Forbidden when the token is missing required scopes for the endpoint.
    """

    assert (
        settings.OIDC_RS_BACKEND_CLASS
        == "core.external_api.authentication.ResourceServerBackend"
    )

    settings.OIDC_RS_CLIENT_ID = "some_client_id"
    settings.OIDC_RS_CLIENT_SECRET = "some_client_secret"

    settings.OIDC_OP_URL = "https://oidc.example.com"
    settings.OIDC_VERIFY_SSL = False
    settings.OIDC_TIMEOUT = 5
    settings.OIDC_PROXY = None
    settings.OIDC_OP_JWKS_ENDPOINT = "https://oidc.example.com/jwks"
    settings.OIDC_OP_INTROSPECTION_ENDPOINT = "https://oidc.example.com/introspect"

    responses.add(
        responses.POST,
        "https://oidc.example.com/introspect",
        json={
            "iss": "https://oidc.example.com",
            "aud": "some_client_id",  # settings.OIDC_RS_CLIENT_ID
            "sub": "very-specific-sub",
            "client_id": "some_service_provider",
            "scope": "openid lasuite_meet",  # missing rooms:list scope
            "active": True,
        },
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer some_token")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 403
