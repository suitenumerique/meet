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
)

# Cache key prefix and TTL for exchange codes
EXCHANGE_CODE_PREFIX = "auth_exchange:"
EXCHANGE_CODE_TTL = 30  # seconds


class OIDCAuthenticationCallbackView(BaseCallbackView):
    """Callback view that generates an exchange code for native app deep links."""

    def login_success(self):
        """After successful login, append exchange code for whitelisted scheme redirects."""
        response = super().login_success()

        if not isinstance(response, HttpResponseRedirect):
            return response

        redirect_url = response.url
        parsed = urlparse(redirect_url)

        # Only intercept redirects to whitelisted custom schemes (native apps).
        # Standard HTTPS redirects (web browser) work fine with cookies.
        allowed_schemes = getattr(settings, "NATIVE_APP_REDIRECT_SCHEMES", [])
        if parsed.scheme not in allowed_schemes:
            return response

        # Generate a short-lived, single-use exchange code
        exchange_code = uuid.uuid4().hex
        session_key = self.request.session.session_key
        cache.set(
            f"{EXCHANGE_CODE_PREFIX}{exchange_code}",
            session_key,
            EXCHANGE_CODE_TTL,
        )

        separator = "&" if parsed.query else "?"
        new_url = f"{redirect_url}{separator}{urlencode({'code': exchange_code})}"
        return HttpResponseRedirect(new_url)
