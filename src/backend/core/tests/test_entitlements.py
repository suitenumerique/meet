"""Tests for the entitlements module."""

# pylint: disable=redefined-outer-name

from unittest import mock

from django.test import override_settings

import pytest
import requests
import responses
from rest_framework.status import HTTP_201_CREATED, HTTP_403_FORBIDDEN
from rest_framework.test import APIClient

from django.core.cache import cache as django_cache

from core import factories
from core.api.serializers import UserMeSerializer
from core.authentication.backends import OIDCAuthenticationBackend
from core.entitlements import EntitlementsUnavailableError, get_user_entitlements
from core.entitlements.backends.deploycenter import DeployCenterEntitlementsBackend
from core.entitlements.backends.local import LocalEntitlementsBackend
from core.entitlements.factory import get_entitlements_backend

pytestmark = pytest.mark.django_db

DC_URL = "https://deploy.example.com/api/v1.0/entitlements/"


@pytest.fixture(autouse=True)
def _clear_cache():
    """Clear Django cache between tests to prevent entitlements cache bleed."""
    django_cache.clear()


# -- LocalEntitlementsBackend --


def test_local_backend_always_grants_access():
    """The local backend should always return can_create=True."""
    backend = LocalEntitlementsBackend()
    result = backend.get_user_entitlements("sub-123", "user@example.com")
    assert result == {"can_create": True}


def test_local_backend_ignores_parameters():
    """The local backend should work regardless of parameters passed."""
    backend = LocalEntitlementsBackend()
    result = backend.get_user_entitlements(
        "sub-123",
        "user@example.com",
        user_info={"some": "claim"},
        force_refresh=True,
    )
    assert result == {"can_create": True}


# -- Factory --


@override_settings(
    ENTITLEMENTS_BACKEND="core.entitlements.backends.local.LocalEntitlementsBackend",
    ENTITLEMENTS_BACKEND_PARAMETERS={},
)
def test_factory_returns_local_backend():
    """The factory should instantiate the configured backend."""
    get_entitlements_backend.cache_clear()
    backend = get_entitlements_backend()
    assert isinstance(backend, LocalEntitlementsBackend)
    get_entitlements_backend.cache_clear()


@override_settings(
    ENTITLEMENTS_BACKEND="core.entitlements.backends.local.LocalEntitlementsBackend",
    ENTITLEMENTS_BACKEND_PARAMETERS={},
)
def test_factory_singleton():
    """The factory should return the same instance on repeated calls."""
    get_entitlements_backend.cache_clear()
    backend1 = get_entitlements_backend()
    backend2 = get_entitlements_backend()
    assert backend1 is backend2
    get_entitlements_backend.cache_clear()


# -- get_user_entitlements public API --


@override_settings(
    ENTITLEMENTS_BACKEND="core.entitlements.backends.local.LocalEntitlementsBackend",
    ENTITLEMENTS_BACKEND_PARAMETERS={},
)
def test_get_user_entitlements_with_local_backend():
    """The public API should delegate to the configured backend."""
    get_entitlements_backend.cache_clear()
    result = get_user_entitlements("sub-123", "user@example.com")
    assert result["can_create"] is True
    get_entitlements_backend.cache_clear()


# -- DeployCenterEntitlementsBackend --


@responses.activate
def test_deploycenter_backend_grants_access():
    """DeployCenter backend should return can_create from API response."""
    responses.add(
        responses.GET,
        DC_URL,
        json={"entitlements": {"can_create": True}},
        status=200,
    )

    backend = DeployCenterEntitlementsBackend(
        base_url=DC_URL,
        service_id="meet",
        api_key="test-key",
    )
    result = backend.get_user_entitlements("sub-123", "user@example.com")
    assert result == {"can_create": True}

    # Verify request was made with correct params and header
    assert len(responses.calls) == 1
    request = responses.calls[0].request
    assert "service_id=meet" in request.url
    assert "account_email=user%40example.com" in request.url
    assert request.headers["X-Service-Auth"] == "Bearer test-key"


@responses.activate
def test_deploycenter_backend_denies_access():
    """DeployCenter backend should return can_create=False when API says so."""
    responses.add(
        responses.GET,
        DC_URL,
        json={"entitlements": {"can_create": False}},
        status=200,
    )

    backend = DeployCenterEntitlementsBackend(
        base_url=DC_URL,
        service_id="meet",
        api_key="test-key",
    )
    result = backend.get_user_entitlements("sub-123", "user@example.com")
    assert result == {"can_create": False}


@responses.activate
@override_settings(ENTITLEMENTS_CACHE_TIMEOUT=300)
def test_deploycenter_backend_uses_cache():
    """DeployCenter should use cached results when not force_refresh."""
    responses.add(
        responses.GET,
        DC_URL,
        json={"entitlements": {"can_create": True}},
        status=200,
    )

    backend = DeployCenterEntitlementsBackend(
        base_url=DC_URL,
        service_id="meet",
        api_key="test-key",
    )

    # First call hits the API
    result1 = backend.get_user_entitlements("sub-123", "user@example.com")
    assert result1 == {"can_create": True}
    assert len(responses.calls) == 1

    # Second call should use cache
    result2 = backend.get_user_entitlements("sub-123", "user@example.com")
    assert result2 == {"can_create": True}
    assert len(responses.calls) == 1  # No additional API call


@responses.activate
@override_settings(ENTITLEMENTS_CACHE_TIMEOUT=300)
def test_deploycenter_backend_force_refresh_bypasses_cache():
    """force_refresh=True should bypass cache and hit the API."""
    responses.add(
        responses.GET,
        DC_URL,
        json={"entitlements": {"can_create": True}},
        status=200,
    )
    responses.add(
        responses.GET,
        DC_URL,
        json={"entitlements": {"can_create": False}},
        status=200,
    )

    backend = DeployCenterEntitlementsBackend(
        base_url=DC_URL,
        service_id="meet",
        api_key="test-key",
    )

    result1 = backend.get_user_entitlements("sub-123", "user@example.com")
    assert result1["can_create"] is True

    result2 = backend.get_user_entitlements(
        "sub-123", "user@example.com", force_refresh=True
    )
    assert result2["can_create"] is False
    assert len(responses.calls) == 2


@responses.activate
@override_settings(ENTITLEMENTS_CACHE_TIMEOUT=300)
def test_deploycenter_backend_fallback_to_stale_cache():
    """When API fails, should return stale cached value if available."""
    responses.add(
        responses.GET,
        DC_URL,
        json={"entitlements": {"can_create": True}},
        status=200,
    )

    backend = DeployCenterEntitlementsBackend(
        base_url=DC_URL,
        service_id="meet",
        api_key="test-key",
    )

    # Populate cache
    backend.get_user_entitlements("sub-123", "user@example.com")

    # Now API fails
    responses.replace(
        responses.GET,
        DC_URL,
        body=requests.ConnectionError("Connection error"),
    )

    # force_refresh to hit API, but should fall back to cache
    result = backend.get_user_entitlements(
        "sub-123", "user@example.com", force_refresh=True
    )
    assert result == {"can_create": True}


@responses.activate
def test_deploycenter_backend_raises_when_no_cache():
    """When API fails and no cache exists, should raise."""
    responses.add(
        responses.GET,
        DC_URL,
        body=requests.ConnectionError("Connection error"),
    )

    backend = DeployCenterEntitlementsBackend(
        base_url=DC_URL,
        service_id="meet",
        api_key="test-key",
    )

    with pytest.raises(EntitlementsUnavailableError):
        backend.get_user_entitlements("sub-123", "user@example.com")


@responses.activate
def test_deploycenter_backend_sends_oidc_claims():
    """DeployCenter should forward configured OIDC claims."""
    responses.add(
        responses.GET,
        DC_URL,
        json={"entitlements": {"can_create": True}},
        status=200,
    )

    backend = DeployCenterEntitlementsBackend(
        base_url=DC_URL,
        service_id="meet",
        api_key="test-key",
        oidc_claims=["organization"],
    )

    backend.get_user_entitlements(
        "sub-123",
        "user@example.com",
        user_info={"organization": "org-42", "other": "ignored"},
    )

    request = responses.calls[0].request
    assert "organization=org-42" in request.url
    assert "other" not in request.url


# -- Auth backend integration --


def test_auth_backend_warms_cache_on_login():
    """post_get_or_create_user should call get_user_entitlements with force_refresh."""
    user = factories.UserFactory()
    backend = OIDCAuthenticationBackend()

    with mock.patch(
        "core.authentication.backends.get_user_entitlements",
        return_value={"can_create": True},
    ) as mock_ent:
        backend.post_get_or_create_user(
            user, {"email": user.email, "sub": "x"}, is_new_user=False
        )
        mock_ent.assert_called_once_with(
            user_sub=user.sub,
            user_email=user.email,
            user_info={"email": user.email, "sub": "x"},
            force_refresh=True,
        )


def test_auth_backend_login_succeeds_when_access_denied():
    """Login should succeed even when can_create is False (gated in frontend)."""
    user = factories.UserFactory()
    backend = OIDCAuthenticationBackend()

    with mock.patch(
        "core.authentication.backends.get_user_entitlements",
        return_value={"can_create": False},
    ):
        # Should not raise — user logs in, frontend gates access
        backend.post_get_or_create_user(
            user, {"email": user.email}, is_new_user=False
        )


def test_auth_backend_login_succeeds_when_entitlements_unavailable():
    """Login should succeed when entitlements service is unavailable."""
    user = factories.UserFactory()
    backend = OIDCAuthenticationBackend()

    with mock.patch(
        "core.authentication.backends.get_user_entitlements",
        side_effect=EntitlementsUnavailableError("unavailable"),
    ):
        # Should not raise
        backend.post_get_or_create_user(
            user, {"email": user.email}, is_new_user=False
        )


# -- UserMeSerializer (can_create field) --


def test_user_me_serializer_includes_can_create_true():
    """UserMeSerializer should include can_create=True when entitled."""
    user = factories.UserFactory()
    with mock.patch(
        "core.api.serializers.get_user_entitlements",
        return_value={"can_create": True},
    ):
        data = UserMeSerializer(user).data
    assert data["can_create"] is True


def test_user_me_serializer_includes_can_create_false():
    """UserMeSerializer should include can_create=False when not entitled."""
    user = factories.UserFactory()
    with mock.patch(
        "core.api.serializers.get_user_entitlements",
        return_value={"can_create": False},
    ):
        data = UserMeSerializer(user).data
    assert data["can_create"] is False


def test_user_me_serializer_can_create_fail_closed():
    """UserMeSerializer should return can_create=False when entitlements unavailable."""
    user = factories.UserFactory()
    with mock.patch(
        "core.api.serializers.get_user_entitlements",
        side_effect=EntitlementsUnavailableError("unavailable"),
    ):
        data = UserMeSerializer(user).data
    assert data["can_create"] is False


# -- /users/me/ endpoint integration --


def test_api_users_me_includes_can_create():
    """GET /users/me/ should include can_create in the response."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 200
    assert "can_create" in response.json()
    assert response.json()["can_create"] is True


def test_api_users_me_can_create_false():
    """GET /users/me/ should return can_create=False when not entitled."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    with mock.patch(
        "core.api.serializers.get_user_entitlements",
        return_value={"can_create": False},
    ):
        response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 200
    assert response.json()["can_create"] is False


# -- Room creation entitlements enforcement --


def test_room_creation_blocked_when_not_entitled():
    """Room creation should return 403 when user has can_create=False."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    with mock.patch(
        "core.api.permissions.get_user_entitlements",
        return_value={"can_create": False},
    ):
        response = client.post(
            "/api/v1.0/rooms/",
            data={"name": "test-room"},
            format="json",
        )

    assert response.status_code == HTTP_403_FORBIDDEN


def test_room_creation_blocked_when_entitlements_unavailable():
    """Room creation should return 403 when entitlements service
    is unavailable (fail-closed)."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    with mock.patch(
        "core.api.permissions.get_user_entitlements",
        side_effect=EntitlementsUnavailableError("unavailable"),
    ):
        response = client.post(
            "/api/v1.0/rooms/",
            data={"name": "test-room"},
            format="json",
        )

    assert response.status_code == HTTP_403_FORBIDDEN


def test_room_creation_allowed_when_entitled():
    """Room creation should succeed when user has can_create=True."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    with mock.patch(
        "core.api.permissions.get_user_entitlements",
        return_value={"can_create": True},
    ):
        response = client.post(
            "/api/v1.0/rooms/",
            data={"name": "test-room"},
            format="json",
        )

    assert response.status_code == HTTP_201_CREATED


# -- Non-create room actions are NOT gated by entitlements --


def test_room_retrieve_allowed_when_not_entitled():
    """Room retrieval should work even when user has can_create=False."""
    user = factories.UserFactory()
    room = factories.RoomFactory()
    client = APIClient()
    client.force_login(user)

    with mock.patch(
        "core.api.permissions.get_user_entitlements",
        return_value={"can_create": False},
    ):
        response = client.get(f"/api/v1.0/rooms/{room.id}/")

    assert response.status_code == 200


def test_room_list_allowed_when_not_entitled():
    """Room listing should work even when user has can_create=False."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    with mock.patch(
        "core.api.permissions.get_user_entitlements",
        return_value={"can_create": False},
    ):
        response = client.get("/api/v1.0/rooms/")

    assert response.status_code == 200
