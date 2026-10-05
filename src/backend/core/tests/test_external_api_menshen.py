"""Tests for the external API MenshenAuthentication."""

from unittest import mock

import pytest
import responses
from lasuite.oidc_resource_server.authentication import ResourceServerAuthentication
from rest_framework.test import APIClient

from core.factories import UserFactory
from core.models import RoleChoices, Room, User

pytestmark = pytest.mark.django_db

SERVER_URL = "https://menshen.example.com"
INTROSPECTION_ENDPOINT = f"{SERVER_URL}/auth/token/introspect/"
TOKEN = "menshen-exchanged-token"


@pytest.fixture(autouse=True)
def menshen_settings(settings):
    """Enable Menshen authentication."""
    settings.MENSHEN_ENABLED = True
    settings.MENSHEN_SERVER_URL = SERVER_URL
    settings.MENSHEN_CLIENT_ID = "meet"
    settings.MENSHEN_CLIENT_SECRET = "meet-secret"


def _introspection(sub, scope="meet:room:create", **overrides):
    return {
        "active": True,
        "sub": sub,
        "email": "user@example.com",
        "scope": scope,
        "aud": "meet",
        "client_id": "menshen",
        **overrides,
    }


def _create_room():
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {TOKEN}")
    return client.post("/external-api/v1.0/rooms/", {}, format="json")


@responses.activate
def test_menshen_active_token():
    """An active token with a mapped scope should create a room owned by the user."""

    user = UserFactory()

    # Catch and mock external HTTP requests
    responses.add(
        responses.POST,
        INTROSPECTION_ENDPOINT,
        json=_introspection(user.sub),
        match=[responses.matchers.urlencoded_params_matcher({"token": TOKEN})],
    )

    response = _create_room()

    assert response.status_code == 201
    room = Room.objects.get(id=response.data["id"])
    assert room.get_role(user) == RoleChoices.OWNER
    assert responses.calls[0].request.headers["Authorization"].startswith("Basic ")


@responses.activate
@mock.patch.object(ResourceServerAuthentication, "authenticate", return_value=None)
def test_menshen_disabled(mock_rs_authenticate, settings):
    """Menshen should not be called when disabled."""

    settings.MENSHEN_ENABLED = False

    response = _create_room()

    assert response.status_code == 401
    assert len(responses.calls) == 0
    mock_rs_authenticate.assert_called_once()


@responses.activate
@mock.patch.object(ResourceServerAuthentication, "authenticate", return_value=None)
def test_menshen_inactive_token_defers(mock_rs_authenticate):
    """An inactive token should defer to the next authentication backend."""

    user = UserFactory()

    responses.add(
        responses.POST,
        INTROSPECTION_ENDPOINT,
        json=_introspection(user.sub, scope="meet:room:create", active=False),
    )

    response = _create_room()

    assert response.status_code == 401
    mock_rs_authenticate.assert_called_once()


@responses.activate
@mock.patch.object(ResourceServerAuthentication, "authenticate", return_value=None)
def test_menshen_error_defers(mock_rs_authenticate):
    """A Menshen error should defer to the next authentication backend."""

    responses.add(responses.POST, INTROSPECTION_ENDPOINT, status=500)

    response = _create_room()

    assert response.status_code == 401
    mock_rs_authenticate.assert_called_once()


@responses.activate
@mock.patch.object(ResourceServerAuthentication, "authenticate", return_value=None)
def test_menshen_unparsable_response_defers(mock_rs_authenticate):
    """A response the client can't parse should defer to the next backend."""

    responses.add(
        responses.POST,
        INTROSPECTION_ENDPOINT,
        json={"active": True, "unexpected": "field"},
    )

    response = _create_room()

    assert response.status_code == 401
    mock_rs_authenticate.assert_called_once()


@responses.activate
def test_menshen_unmapped_scope():
    """Scopes granted for other services or other Meet actions should not grant access."""

    user = UserFactory()

    responses.add(
        responses.POST,
        INTROSPECTION_ENDPOINT,
        json=_introspection(user.sub, scope="drive:item:create meet:room:list"),
    )

    response = _create_room()

    assert response.status_code == 403
    assert "insufficient permissions." in str(response.data).lower()
    assert not Room.objects.exists()


@responses.activate
def test_menshen_missing_sub():
    """An active token without sub should be rejected."""

    responses.add(responses.POST, INTROSPECTION_ENDPOINT, json=_introspection(None))

    response = _create_room()

    assert response.status_code == 401
    assert "invalid token claims." in str(response.data).lower()


@responses.activate
def test_menshen_inactive_user():
    """An active token for an inactive user should be rejected."""

    user = UserFactory(is_active=False)

    responses.add(responses.POST, INTROSPECTION_ENDPOINT, json=_introspection(user.sub))

    response = _create_room()

    assert response.status_code == 401
    assert "user account is disabled." in str(response.data).lower()


@responses.activate
def test_menshen_unknown_user_created(settings):
    """An unknown sub should create a user when OIDC_CREATE_USER is set."""

    settings.OIDC_CREATE_USER = True

    responses.add(
        responses.POST, INTROSPECTION_ENDPOINT, json=_introspection("new-sub")
    )

    response = _create_room()

    assert response.status_code == 201
    user = User.objects.get(sub="new-sub")
    assert user.email == "user@example.com"
    assert user.is_active is True


@responses.activate
def test_menshen_unknown_user_not_created(settings):
    """An unknown sub should be rejected when OIDC_CREATE_USER is unset."""

    settings.OIDC_CREATE_USER = False

    responses.add(
        responses.POST, INTROSPECTION_ENDPOINT, json=_introspection("new-sub")
    )

    response = _create_room()

    assert response.status_code == 401
    assert "user not found." in str(response.data).lower()
    assert not User.objects.filter(sub="new-sub").exists()
