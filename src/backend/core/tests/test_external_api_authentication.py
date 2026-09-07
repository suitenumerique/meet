"""Tests for the external API ResourceServerBackend."""

from django.core.exceptions import SuspiciousOperation

import pytest
import responses
from rest_framework.test import APIClient

from core.external_api.authentication import ResourceServerBackend
from core.factories import UserFactory
from core.models import User

pytestmark = pytest.mark.django_db


def _payload(sub):
    return {"sub": sub, "active": True, "scope": "lasuite_meet", "client_id": "app"}


def test_resource_server_backend_get_or_create_user_active():
    """An existing active user matching the sub should be returned."""

    user = UserFactory()

    result = ResourceServerBackend().get_or_create_user(
        access_token="token", id_token=None, payload=_payload(user.sub)
    )

    assert result == user


def test_resource_server_backend_get_or_create_user_inactive():
    """An inactive user should be rejected even with a valid token."""

    user = UserFactory(is_active=False)

    with pytest.raises(SuspiciousOperation, match="User account is disabled."):
        ResourceServerBackend().get_or_create_user(
            access_token="token", id_token=None, payload=_payload(user.sub)
        )


def test_resource_server_backend_get_or_create_user_creates(settings):
    """An unknown sub should create an active user when OIDC_CREATE_USER is set."""

    settings.OIDC_CREATE_USER = True

    result = ResourceServerBackend().get_or_create_user(
        access_token="token", id_token=None, payload=_payload("new-sub")
    )

    assert result.sub == "new-sub"
    assert result.is_active is True
    assert User.objects.filter(sub="new-sub").exists()


def test_resource_server_backend_get_or_create_user_no_creation(settings):
    """An unknown sub should return None when OIDC_CREATE_USER is unset."""

    settings.OIDC_CREATE_USER = False

    result = ResourceServerBackend().get_or_create_user(
        access_token="token", id_token=None, payload=_payload("new-sub")
    )

    assert result is None
    assert not User.objects.filter(sub="new-sub").exists()


@responses.activate
def test_api_rooms_list_resource_server_inactive_user(settings):
    """End to end: a valid introspected token for an inactive user should get 401."""

    settings.OIDC_OP_INTROSPECTION_ENDPOINT = "https://oidc.example.com/introspect"
    settings.OIDC_OP_URL = "https://oidc.example.com"

    user = UserFactory(is_active=False)

    responses.add(
        responses.POST,
        "https://oidc.example.com/introspect",
        json={
            "iss": "https://oidc.example.com",
            "active": True,
            "sub": user.sub,
            "scope": "openid lasuite_meet rooms:list",
            "client_id": "app",
        },
    )

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer rs-token")
    response = client.get("/external-api/v1.0/rooms/")

    assert response.status_code == 401
    assert "login failed" in str(response.data).lower()
