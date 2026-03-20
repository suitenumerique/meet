"""Custom OIDC authentication views for native app support.

When a native app (iOS, Android, Desktop) initiates OIDC login, it sets
`returnTo` to a custom URL scheme (e.g. `visio://auth-callback`). After
the OIDC flow completes, Django sets the session cookie and redirects to
that URL. However, native apps cannot read browser cookies — they need
the session ID passed explicitly.

Instead of exposing the session ID directly in the redirect URL, this
module generates a short-lived, single-use exchange code. The native app
then exchanges this code for the session ID via a dedicated API endpoint.
"""

import uuid
from urllib.parse import urlencode, urlparse

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponseRedirect

from lasuite.oidc_login.views import (
    OIDCAuthenticationCallbackView as BaseCallbackView,
    OIDCAuthenticationRequestView as BaseRequestView,
)

# Cache key prefix and TTL for exchange codes
EXCHANGE_CODE_PREFIX = "auth_exchange:"
EXCHANGE_CODE_TTL = 30  # seconds


class NativeAppRedirect(HttpResponseRedirect):
    """HttpResponseRedirect subclass that allows native app custom URL schemes.

    Django's HttpResponseRedirect only allows http, https, and ftp schemes.
    Native apps use custom schemes (e.g. visio://) for deep links, which
    Django rejects with DisallowedRedirect. This subclass extends
    allowed_schemes with the configured native app schemes.
    """

    allowed_schemes = HttpResponseRedirect.allowed_schemes + list(
        getattr(settings, "NATIVE_APP_REDIRECT_SCHEMES", [])
    )


class OIDCAuthenticationRequestView(BaseRequestView):
    """Custom authenticate view that preserves native app returnTo in session.

    mozilla-django-oidc's get_next_url() rejects custom URL schemes
    (e.g. visio://auth-callback) because url_has_allowed_host_and_scheme()
    only allows http/https. We intercept the returnTo parameter and store
    it directly in the session for whitelisted schemes, bypassing the
    safety check (which is not relevant for native app deep links).
    """

    def get(self, request):
        redirect_field = getattr(settings, "OIDC_REDIRECT_FIELD_NAME", "returnTo")
        return_to = request.GET.get(redirect_field, "")
        parsed = urlparse(return_to)
        allowed_schemes = getattr(settings, "NATIVE_APP_REDIRECT_SCHEMES", [])

        response = super().get(request)

        # Override oidc_login_next AFTER super() which set it to None
        # via get_next_url() rejecting the custom scheme.
        if parsed.scheme in allowed_schemes:
            request.session["oidc_login_next"] = return_to
            request.session.save()

        return response


class OIDCAuthenticationCallbackView(BaseCallbackView):
    """Callback view that generates an exchange code for native app deep links."""

    def login_success(self):
        """After successful login, append exchange code for whitelisted scheme redirects."""
        # Temporarily remove native redirect from session to prevent
        # super().login_success() from raising DisallowedRedirect when
        # it tries HttpResponseRedirect with a custom scheme.
        native_redirect = self.request.session.pop("oidc_login_next", None)
        allowed_schemes = getattr(settings, "NATIVE_APP_REDIRECT_SCHEMES", [])
        parsed = urlparse(native_redirect or "")

        if native_redirect and parsed.scheme in allowed_schemes:
            # Let super() redirect to the default URL (homepage)
            super().login_success()

            # Generate a short-lived, single-use exchange code
            exchange_code = uuid.uuid4().hex
            session_key = self.request.session.session_key
            cache.set(
                f"{EXCHANGE_CODE_PREFIX}{exchange_code}",
                session_key,
                EXCHANGE_CODE_TTL,
            )

            separator = "&" if parsed.query else "?"
            new_url = (
                f"{native_redirect}{separator}{urlencode({'code': exchange_code})}"
            )
            return NativeAppRedirect(new_url)

        return super().login_success()
