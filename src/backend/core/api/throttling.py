"""Throttling modules for the API."""

from django.conf import settings

from lasuite.drf.throttling import MonitoredThrottleMixin
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from sentry_sdk import capture_message


def sentry_monitoring_throttle_failure(message):
    """Log when a failure occurs to detect rate limiting issues."""
    capture_message(message, "warning")


class MonitoredAnonRateThrottle(MonitoredThrottleMixin, AnonRateThrottle):
    """Throttle for the monitored scoped rate throttle."""


class MonitoredUserRateThrottle(MonitoredThrottleMixin, UserRateThrottle):
    """Throttle for the monitored scoped rate throttle."""


class RequestEntryAuthenticatedUserRateThrottle(MonitoredUserRateThrottle):
    """Throttle authenticated user requesting room entry"""

    scope = "request_entry"

    def get_cache_key(self, request, view):
        """Use the authenticated user ID as the throttle cache key."""

        if request.user and not request.user.is_authenticated:
            return None  # Defer to RequestEntryAnonRateThrottle for anonymous users.

        return super().get_cache_key(request, view)


class RequestEntryAnonRateThrottle(MonitoredAnonRateThrottle):
    """Throttle Anonymous user requesting room entry"""

    scope = "request_entry"

    def get_cache_key(self, request, view):
        """Use the lobby participant cookie ID as the throttle cache key.

        Only throttle if a cookie is already set. If no cookie exists yet,
        return None to skip throttling — the cookie will be set on the first
        response, and throttling will apply from the second request onward.

        Keying on the cookie rather than the IP address prevents penalising
        multiple users behind the same NAT/proxy, and is consistent with how
        LobbyService identifies participants.

        Note: as per DRF documentation, application-level throttling is not a
        security measure against brute-force or DoS attacks. This throttle exists
        solely to guard against accidental hammering from buggy clients.
        """

        if request.user and request.user.is_authenticated:
            return None  # Only throttle unauthenticated requests.

        participant_id = request.COOKIES.get(settings.LOBBY_COOKIE_NAME)

        if participant_id is None:
            return None  # No throttling for cookieless requests

        return self.cache_format % {
            "scope": self.scope,
            "ident": participant_id,
        }


class CreationCallbackAnonRateThrottle(MonitoredAnonRateThrottle):
    """Throttle Anonymous user requesting room generation callback"""

    scope = "creation_callback"


class SessionExchangeAnonRateThrottle(MonitoredAnonRateThrottle):
    """Throttle anonymous requests to the session exchange endpoint."""

    scope = "session_exchange"
