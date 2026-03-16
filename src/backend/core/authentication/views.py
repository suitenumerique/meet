"""Custom OIDC authentication views for native app support.

When a native app (iOS, Android, Desktop) initiates OIDC login, it sets
`returnTo` to a custom URL scheme (e.g. `visio://auth-callback`). After
the OIDC flow completes, Django sets the session cookie and redirects to
that URL. However, native apps cannot read browser cookies — they need
the session ID passed explicitly in the redirect URL.

This module overrides the OIDC callback view to append the session ID as
a query parameter when the redirect target uses a non-HTTPS scheme.
"""

from urllib.parse import urlencode, urlparse

from django.conf import settings
from django.http import HttpResponseRedirect

from lasuite.oidc_login.views import (
    OIDCAuthenticationCallbackView as BaseCallbackView,
)


class OIDCAuthenticationCallbackView(BaseCallbackView):
    """Callback view that passes session ID to native app deep links."""

    def login_success(self):
        """After successful login, append session ID for custom-scheme redirects."""
        response = super().login_success()

        # Only modify redirects to custom URL schemes (native apps).
        # Standard HTTPS redirects (web browser) work fine with cookies.
        if isinstance(response, HttpResponseRedirect):
            redirect_url = response.url
            parsed = urlparse(redirect_url)
            if parsed.scheme and parsed.scheme not in ("http", "https", ""):
                session_key = self.request.session.session_key
                cookie_name = getattr(
                    settings, "SESSION_COOKIE_NAME", "sessionid"
                )
                separator = "&" if parsed.query else "?"
                new_url = (
                    f"{redirect_url}{separator}"
                    f"{urlencode({cookie_name: session_key})}"
                )
                return HttpResponseRedirect(new_url)

        return response
