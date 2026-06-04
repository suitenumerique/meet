"""Tests for PKCE/OIDC authentication views and OAuth token endpoints."""

from unittest import mock

from django.contrib.sessions.middleware import SessionMiddleware
from django.core.cache import cache
from django.http import HttpResponseRedirect
from django.test import RequestFactory

import pytest
from mozilla_django_oidc.utils import generate_code_challenge
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from core.authentication.views import (
    OIDCAuthenticationCallbackWithPkceView,
    PKCEOIDCAuthenticationRequestView,
    get_pkce_authorization_code_cache_key,
)
from core.factories import UserFactory

pytestmark = pytest.mark.django_db


def _attach_session(request):
    """Attach a working session to a request-factory request."""
    middleware = SessionMiddleware(lambda req: None)
    middleware.process_request(request)
    request.session.save()


def test_pkce_oidc_authentication_request_view_stores_pkce_data():
    """Should store PKCE data in session when response_type is code."""
    code_challenge = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    state = "NhnR1y7iA2aCrh3Ic5_6wD9rI3C-N3fDNzxt3wti7e1"
    request = RequestFactory().get(
        "/api/v1.0/authenticate/",
        {
            "response_type": "code",
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
        },
    )
    _attach_session(request)

    with mock.patch(
        "core.authentication.views.OIDCAuthenticationRequestView.get",
        return_value=HttpResponseRedirect("https://sso.example/authorize"),
    ):
        response = PKCEOIDCAuthenticationRequestView().get(request)

    assert response.status_code == status.HTTP_302_FOUND
    assert request.session["pkce_oidc_response_type"] == "code"
    assert request.session["pkce_oidc_data"] == {
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
    }


def test_pkce_oidc_authentication_request_view_invalid_parameters():
    """Should return 400 when PKCE params are invalid."""
    request = RequestFactory().get(
        "/api/v1.0/authenticate/",
        {
            "response_type": "code",
            "code_challenge": "too-short",
            "state": "also-too-short",
        },
    )
    _attach_session(request)

    with mock.patch(
        "core.authentication.views.OIDCAuthenticationRequestView.get",
        return_value=HttpResponseRedirect("https://sso.example/authorize"),
    ):
        response = PKCEOIDCAuthenticationRequestView().get(request)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["detail"] == "Invalid pkce request parameters."


@pytest.mark.parametrize(
    ("length", "expected_status"),
    [(43, status.HTTP_302_FOUND), (128, status.HTTP_302_FOUND)],
)
def test_pkce_oidc_authentication_request_view_pkce_length_boundaries_are_valid(
    length, expected_status
):
    """Should accept PKCE request fields at min/max allowed lengths."""
    code_challenge = "a" * length
    state = "b" * length
    request = RequestFactory().get(
        "/api/v1.0/authenticate/",
        {
            "response_type": "code",
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
        },
    )
    _attach_session(request)

    with mock.patch(
        "core.authentication.views.OIDCAuthenticationRequestView.get",
        return_value=HttpResponseRedirect("https://sso.example/authorize"),
    ):
        response = PKCEOIDCAuthenticationRequestView().get(request)

    assert response.status_code == expected_status
    assert request.session["pkce_oidc_data"] == {
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
    }


@pytest.mark.parametrize(
    ("field_name", "length"),
    [
        ("code_challenge", 42),
        ("code_challenge", 129),
        ("state", 42),
        ("state", 129),
    ],
)
def test_pkce_oidc_authentication_request_view_rejects_out_of_bounds_lengths(
    field_name, length
):
    """Should reject PKCE request fields shorter/longer than allowed."""
    params = {
        "response_type": "code",
        "code_challenge": "a" * 43,
        "code_challenge_method": "S256",
        "state": "b" * 43,
    }
    params[field_name] = "c" * length
    request = RequestFactory().get("/api/v1.0/authenticate/", params)
    _attach_session(request)

    with mock.patch(
        "core.authentication.views.OIDCAuthenticationRequestView.get",
        return_value=HttpResponseRedirect("https://sso.example/authorize"),
    ):
        response = PKCEOIDCAuthenticationRequestView().get(request)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["detail"] == "Invalid pkce request parameters."
    assert any(error["loc"] == (field_name,) for error in response.data["errors"])


def test_pkce_oidc_authentication_request_view_non_code_response_type():
    """Should leave session untouched when response_type is not code."""
    request = RequestFactory().get(
        "/api/v1.0/authenticate/",
        {"response_type": "token"},
    )
    _attach_session(request)

    with mock.patch(
        "core.authentication.views.OIDCAuthenticationRequestView.get",
        return_value=HttpResponseRedirect("https://sso.example/authorize"),
    ):
        response = PKCEOIDCAuthenticationRequestView().get(request)

    assert response.status_code == status.HTTP_302_FOUND
    assert "pkce_oidc_response_type" not in request.session
    assert "pkce_oidc_data" not in request.session


def test_oidc_callback_with_pkce_login_success_returns_mobile_redirect(settings):
    """Should cache auth code and redirect to mobile deep-link URL."""
    user = UserFactory()
    request = RequestFactory().get("/api/v1.0/callback/")
    _attach_session(request)

    code_challenge = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    state = "NhnR1y7iA2aCrh3Ic5_6wD9rI3C-N3fDNzxt3wti7e1"
    request.session["pkce_oidc_response_type"] = "code"
    request.session["pkce_oidc_data"] = {
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
    }
    request.session.save()

    view = OIDCAuthenticationCallbackWithPkceView()
    view.request = request
    view.user = user

    with (
        mock.patch(
            "core.authentication.views.OIDCAuthenticationCallbackView.login_success",
            return_value=HttpResponseRedirect("/mobile-login"),
        ),
        mock.patch(
            "core.authentication.views.secrets.token_urlsafe",
            return_value="code",
        ),
    ):
        response = view.login_success()

    assert response.status_code == status.HTTP_302_FOUND
    assert response.url.startswith(settings.MOBILE_DEEP_LINK_SCHEME)
    assert "code=code" in response.url
    assert f"state={state}" in response.url

    cached = cache.get(get_pkce_authorization_code_cache_key("code"))
    assert cached == {
        "user_id": user.pk,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }


def test_oidc_callback_with_pkce_login_success_non_mobile_redirect_fails():
    """Should fallback to failure when callback URL is not the mobile login URL."""
    user = UserFactory()
    request = RequestFactory().get("/api/v1.0/callback/")
    _attach_session(request)
    request.session["pkce_oidc_response_type"] = "code"

    code_challenge = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    state = "NhnR1y7iA2aCrh3Ic5_6wD9rI3C-N3fDNzxt3wti7e1"
    request.session["pkce_oidc_data"] = {
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
    }
    request.session.save()

    view = OIDCAuthenticationCallbackWithPkceView()
    view.request = request
    view.user = user

    with (
        mock.patch(
            "core.authentication.views.OIDCAuthenticationCallbackView.login_success",
            return_value=HttpResponseRedirect("/somewhere-else"),
        ),
        mock.patch.object(
            OIDCAuthenticationCallbackWithPkceView,
            "login_failure",
            return_value=HttpResponseRedirect("/failure"),
        ),
    ):
        response = view.login_success()

    assert response.status_code == status.HTTP_302_FOUND
    assert response.url == "/failure"


def test_oidc_callback_with_pkce_login_success_without_pkce_data_fails():
    """Should fallback to login failure when PKCE data is missing from session."""
    user = UserFactory()
    request = RequestFactory().get("/api/v1.0/callback/")
    _attach_session(request)
    request.session["pkce_oidc_response_type"] = "code"
    request.session.save()

    view = OIDCAuthenticationCallbackWithPkceView()
    view.request = request
    view.user = user

    with (
        mock.patch(
            "core.authentication.views.OIDCAuthenticationCallbackView.login_success",
            return_value=HttpResponseRedirect("/mobile-login"),
        ),
        mock.patch.object(
            OIDCAuthenticationCallbackWithPkceView,
            "login_failure",
            return_value=HttpResponseRedirect("/failure"),
        ),
    ):
        response = view.login_success()

    assert response.status_code == status.HTTP_302_FOUND
    assert response.url == "/failure"


def test_oauth_token_exchange_success_and_single_use():
    """Should exchange a valid auth code once for JWT tokens."""
    user = UserFactory()
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    code = "my-auth-code-at-least-43-characters-like-really"
    cache.set(
        get_pkce_authorization_code_cache_key(code),
        {
            "user_id": user.pk,
            "code_challenge": generate_code_challenge(verifier, "S256"),
            "code_challenge_method": "S256",
        },
        timeout=120,
    )

    client = APIClient()
    response = client.post(
        "/api/v1.0/oauth/token/",
        {"code": code, "code_verifier": verifier},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert set(response.json()) == {"refresh", "access"}

    second_try = client.post(
        "/api/v1.0/oauth/token/",
        {"code": code, "code_verifier": verifier},
        format="json",
    )
    assert second_try.status_code == status.HTTP_400_BAD_REQUEST
    assert second_try.json() == {"detail": "Invalid or expired authorization code."}


def test_oauth_token_exchange_invalid_code_verifier_consumes_code():
    """Should reject invalid verifier and consume the auth code."""
    user = UserFactory()
    code = "my-auth-code-at-least-43-characters-like-really-2"
    cache.set(
        get_pkce_authorization_code_cache_key(code),
        {
            "user_id": user.pk,
            "code_challenge": generate_code_challenge(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "S256"
            ),
            "code_challenge_method": "S256",
        },
        timeout=120,
    )

    client = APIClient()
    response = client.post(
        "/api/v1.0/oauth/token/",
        {
            "code": code,
            "code_verifier": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"detail": "Invalid code_verifier."}
    assert cache.get(get_pkce_authorization_code_cache_key(code)) is None


@pytest.mark.parametrize(
    ("field_name", "length"),
    [
        ("code", 42),
        ("code", 129),
        ("code_verifier", 42),
        ("code_verifier", 129),
    ],
)
def test_oauth_token_exchange_rejects_out_of_bounds_lengths(field_name, length):
    """Should reject PKCE token exchange fields shorter/longer than allowed."""
    payload = {
        "code": "a" * 43,
        "code_verifier": "b" * 43,
    }
    payload[field_name] = "c" * length

    client = APIClient()
    response = client.post("/api/v1.0/oauth/token/", payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    data = response.json()
    assert data["detail"] == "Invalid pkce request parameters."
    assert any(error["loc"] == [field_name] for error in data["errors"])


def test_oauth_token_refresh_endpoint_returns_access_token():
    """Should issue a new access token from a valid refresh token."""
    user = UserFactory()
    refresh = RefreshToken.for_user(user)

    client = APIClient()
    response = client.post(
        "/api/v1.0/oauth/token/refresh/",
        {"refresh": str(refresh)},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert "access" in response.json()
