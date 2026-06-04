"""PKCE OIDC Authentication Views for native mobile/desktop apps.

Implements RFC 8252 (OAuth 2.0 for Native Apps) on top of the existing
lasuite/mozilla-django-oidc auth code flow. Web browser flows are unaffected
when the `response_type=code` PKCE marker is absent.
"""

import logging
import secrets
from urllib.parse import urlsplit

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.http import HttpResponseRedirect

from lasuite.oidc_login.views import (
    OIDCAuthenticationCallbackView,
    OIDCAuthenticationRequestView,
)
from mozilla_django_oidc.utils import generate_code_challenge
from pydantic import ValidationError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from core.authentication.schemas import (
    PKCEAuthenticationRequestModel,
    PKCETokenExchangeModel,
)
from core.utils import update_url_query_params

logger = logging.getLogger(__name__)
User = get_user_model()


PKCE_AUTH_CODE_CACHE_KEY_PREFIX = "pkce-auth-code"
AUTHORIZATION_CODE_SIZE = 64


def get_pkce_authorization_code_cache_key(code: str) -> str:
    """Generate cache key for PKCE authorization code."""
    return f"{PKCE_AUTH_CODE_CACHE_KEY_PREFIX}:{code}"


def is_mobile_login_url(url: str) -> bool:
    """Check if URL is for mobile login."""
    return urlsplit(url).path == "/mobile-login"


class PKCEOIDCAuthenticationRequestView(OIDCAuthenticationRequestView):
    """OIDC authentication request view with PKCE support for native apps.

    Extends the lasuite OIDCAuthenticationRequestView to detect PKCE
    parameters (`code_challenge`, `code_challenge_method`, `state`) in the
    incoming request and store them in the session for later use by the
    callback. Web flows without `response_type=code` are untouched.
    """

    def get(self, request):
        response = super().get(request)

        if request.GET.get("response_type", None) != "code":
            return response

        try:
            pkce_data = PKCEAuthenticationRequestModel.model_validate(
                {
                    "code_challenge": request.GET.get("code_challenge"),
                    "code_challenge_method": request.GET.get(
                        "code_challenge_method",
                        "S256",
                    ),
                    "state": request.GET.get("state"),
                }
            )
        except ValidationError as e:
            return Response(
                {"detail": "Invalid pkce request parameters.", "errors": e.errors()},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.session["pkce_oidc_response_type"] = "code"
        request.session["pkce_oidc_data"] = pkce_data.model_dump()
        request.session.save()
        return response


class MobileFriendlyRedirect(HttpResponseRedirect):
    """Redirect that allows the configured native-app deep-link scheme."""

    @property
    def allowed_schemes(self) -> list[str]:
        """Add the mobile deep link prefix to the allowed schemes list."""
        return [
            *HttpResponseRedirect.allowed_schemes,
            settings.MOBILE_DEEP_LINK_SCHEME.split(":")[0],
        ]


class OIDCAuthenticationCallbackWithPkceView(OIDCAuthenticationCallbackView):
    """OIDC callback view that emits a one-time PKCE authorization code.

    On successful SSO login for a PKCE-marked session, generates a 64-byte
    URL-safe authorization code bound to the request's code_challenge,
    stores it in cache with `AUTH_PKCE_CACHE_TTL_SECONDS` TTL, and redirects
    to `MOBILE_DEEP_LINK_SCHEME?code=...&state=...`. Web flows fall through
    to the parent class behavior.
    """

    def login_success(self):
        """Handle successful login callback."""
        res = super().login_success()
        if self.request.session.pop("pkce_oidc_response_type", None) != "code":
            logger.info(
                "PKCE response type not 'code', defaulting to usual login success response"
            )
            return res

        pkce_data = self.request.session.pop("pkce_oidc_data", None)
        self.request.session.save()
        if not pkce_data:
            logger.error("No PKCE data found in session")
            return self.login_failure()

        authorization_code = secrets.token_urlsafe(AUTHORIZATION_CODE_SIZE)
        cache.set(
            get_pkce_authorization_code_cache_key(authorization_code),
            {
                "user_id": self.user.pk,
                "code_challenge": pkce_data["code_challenge"],
                "code_challenge_method": pkce_data["code_challenge_method"],
            },
            timeout=settings.AUTH_PKCE_CACHE_TTL_SECONDS,
        )

        if not is_mobile_login_url(res.url):
            logger.warning(
                "PKCE mobile callback did not resolve to the expected mobile login URL"
            )
            return self.login_failure()

        logger.info(
            "Mobile login successful, redirecting to mobile app for user %s",
            self.user.pk,
        )
        mobile_redirect = update_url_query_params(
            settings.MOBILE_DEEP_LINK_SCHEME,
            {"code": [authorization_code], "state": [pkce_data["state"]]},
        )
        return MobileFriendlyRedirect(mobile_redirect)

    def login_failure(self):
        logger.info("Login failed")
        return super().login_failure()


class PKCEOAuthTokenExchangeView(APIView):
    """OAuth token exchange endpoint for PKCE native-app flow.

    POST `{code, code_verifier}`. Verifies the verifier against the cached
    challenge using constant-time comparison, then issues an access+refresh
    JWT pair via SimpleJWT. The authorization code is deleted on first use
    (anti-replay).
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request) -> Response:
        """Handle request for PKCE OAuth token exchange."""
        try:
            request_data = PKCETokenExchangeModel.model_validate(request.data)
        except ValidationError as e:
            return Response(
                {"detail": "Invalid pkce request parameters.", "errors": e.errors()},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cache_key = get_pkce_authorization_code_cache_key(request_data.code)
        code_data = cache.get(cache_key)
        if not code_data:
            return Response(
                {"detail": "Invalid or expired authorization code."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Single-use: invalidate the code BEFORE verification so a failed
        # attempt cannot be retried (prevents oracle).
        cache.delete(cache_key)

        expected_challenge = code_data["code_challenge"]
        method = code_data.get("code_challenge_method", "S256")

        computed_challenge = generate_code_challenge(request_data.code_verifier, method)
        if not secrets.compare_digest(computed_challenge, expected_challenge):
            logger.warning("Invalid code_verifier for PKCE token exchange")
            return Response(
                {"detail": "Invalid code_verifier."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(pk=code_data["user_id"], is_active=True).first()
        if not user:
            return Response(
                {"detail": "Invalid authorization code user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            }
        )
