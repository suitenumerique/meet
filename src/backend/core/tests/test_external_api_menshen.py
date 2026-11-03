"""Tests for the external API MenshenAuthentication."""

from unittest import mock

import pytest
import responses
from lasuite.oidc_resource_server.authentication import ResourceServerAuthentication
from rest_framework.test import APIClient

from core.audit.testing import find_events
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


def _create_room(token=TOKEN):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
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
def test_menshen_other_token_type_ignored(mock_rs_authenticate):
    """A token sent with another scheme than Bearer should not be introspected."""

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {TOKEN}")
    response = client.post("/external-api/v1.0/rooms/", {}, format="json")

    assert response.status_code == 401
    assert len(responses.calls) == 0
    mock_rs_authenticate.assert_called_once()


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
def test_menshen_resource_server_token(settings):
    """End to end: a token issued by the OIDC provider is unknown to Menshen and
    should still authenticate through the resource server."""

    settings.OIDC_OP_INTROSPECTION_ENDPOINT = "https://oidc.example.com/introspect"
    settings.OIDC_OP_URL = "https://oidc.example.com"

    user = UserFactory()
    token = "oidc-access-token"

    responses.add(
        responses.POST,
        INTROSPECTION_ENDPOINT,
        json={"active": False},
        match=[responses.matchers.urlencoded_params_matcher({"token": token})],
    )
    responses.add(
        responses.POST,
        "https://oidc.example.com/introspect",
        json={
            "iss": "https://oidc.example.com",
            "active": True,
            "sub": user.sub,
            "scope": "openid lasuite_meet rooms:create",
            "client_id": "app",
        },
    )

    response = _create_room(token)

    assert response.status_code == 201
    room = Room.objects.get(id=response.data["id"])
    assert room.get_role(user) == RoleChoices.OWNER
    responses.assert_call_count(INTROSPECTION_ENDPOINT, 1)
    responses.assert_call_count("https://oidc.example.com/introspect", 1)


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
def test_menshen_invalid_sub(settings):
    """An active token with an invalid sub should be rejected without creating a user."""

    settings.OIDC_CREATE_USER = True

    responses.add(
        responses.POST, INTROSPECTION_ENDPOINT, json=_introspection("invalid\nsub")
    )

    response = _create_room()

    assert response.status_code == 401
    assert "invalid sub claim" in str(response.data).lower()
    assert not User.objects.exists()


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


@responses.activate
@pytest.mark.parametrize("existing_sub", [None, "other-sub"])
def test_menshen_unknown_user_email_already_used(settings, existing_sub):
    """An unknown sub should not create a second account with an email already
    used, by a provisional user or a user with another sub, when
    OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION=True."""

    settings.OIDC_CREATE_USER = True
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True

    existing_user = UserFactory(sub=existing_sub, email="User@Example.com")

    responses.add(
        responses.POST, INTROSPECTION_ENDPOINT, json=_introspection("new-sub")
    )

    response = _create_room()

    assert response.status_code == 401
    assert "email already used by another account." in str(response.data).lower()
    assert User.objects.count() == 1
    existing_user.refresh_from_db()
    assert existing_user.sub == existing_sub
    assert not Room.objects.exists()


@responses.activate
def test_menshen_is_audited_as_application(audit_events):
    """A call with a Menshen token is made by the client Menshen reports, acting for
    the user. Neither the token, nor the jti Menshen derives from an opaque token,
    nor the email ever appear."""

    user = UserFactory(email="user@example.com")

    responses.add(
        responses.POST,
        INTROSPECTION_ENDPOINT,
        json=_introspection(user.sub, email="user@example.com", jti=TOKEN[:50]),
    )

    response = _create_room()

    assert response.status_code == 201
    [event] = find_events(audit_events, "room.create")

    assert event["lasuite"]["actor"] == {"type": "application", "sub": user.sub}
    assert event["lasuite"]["auth"] == {"method": "menshen_token"}
    assert event["lasuite"]["application"] == {"client_id": "menshen"}
    assert event["user"] == {"id": str(user.pk), "domain": "example.com"}
    assert event["entity"]["target"]["id"] == response.data["id"]
    assert not find_events(audit_events, "user.provision")
    assert TOKEN not in str(audit_events)
    assert "user@example.com" not in str(audit_events)


@responses.activate
def test_menshen_unknown_user_created_is_audited(audit_events, settings):
    """A user created for an unknown sub is provisioned by the client Menshen reports,
    before the call it makes as that user."""

    settings.OIDC_CREATE_USER = True

    responses.add(
        responses.POST, INTROSPECTION_ENDPOINT, json=_introspection("new-sub")
    )

    response = _create_room()

    assert response.status_code == 201
    user = User.objects.get(sub="new-sub")
    [provision, create] = audit_events

    assert provision["event"]["action"] == "user.provision"
    assert provision["event"]["category"] == ["iam"]
    assert provision["event"]["type"] == ["user", "creation"]
    assert provision["lasuite"]["outcome"] == "success"
    assert provision["lasuite"]["actor"] == {"type": "application"}
    assert provision["lasuite"]["auth"] == {"method": "menshen_token"}
    assert provision["lasuite"]["application"] == {"client_id": "menshen"}
    assert provision["user"] == {
        "target": {"id": str(user.pk), "domain": "example.com"}
    }
    assert provision["entity"]["target"] == {
        "id": str(user.pk),
        "type": ["user"],
        "sub_type": "user",
        "raw": {"sub": "new-sub"},
    }
    assert provision["http"]["request"]["id"] == create["http"]["request"]["id"]
    assert "user@example.com" not in str(provision)

    assert create["event"]["action"] == "room.create"
    assert create["user"]["id"] == str(user.pk)


@responses.activate
def test_menshen_unknown_user_email_already_used_is_audited(audit_events, settings):
    """A user that is not created because its email is already used is a conflict
    with the existing account, recorded with the sub that was refused."""

    settings.OIDC_CREATE_USER = True
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True

    existing_user = UserFactory(sub=None, email="User@Example.com")

    responses.add(
        responses.POST, INTROSPECTION_ENDPOINT, json=_introspection("new-sub")
    )

    response = _create_room()

    assert response.status_code == 401

    [provision] = find_events(audit_events, "user.provision")

    assert provision["event"]["outcome"] == "failure"
    assert provision["event"]["reason"] == "conflict"
    assert provision["lasuite"]["outcome"] == "failure"
    assert provision["lasuite"]["actor"] == {"type": "application"}
    assert provision["lasuite"]["auth"] == {"method": "menshen_token"}
    assert provision["lasuite"]["application"] == {"client_id": "menshen"}
    assert provision["user"] == {
        "target": {"id": str(existing_user.pk), "domain": "example.com"}
    }
    assert provision["entity"]["target"]["id"] == str(existing_user.pk)
    assert provision["lasuite"]["details"] == {"requested_sub": "new-sub"}
    assert provision["log"]["level"] == "warning"
    assert "user@example.com" not in str(provision).lower()

    [create] = find_events(audit_events, "room.create")

    assert create["lasuite"]["outcome"] == "denied"
    assert create["event"]["reason"] == "authentication_failed"
