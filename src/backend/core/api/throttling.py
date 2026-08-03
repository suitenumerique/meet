"""Throttling modules for the API."""

from lasuite.drf.throttling import MonitoredThrottleMixin
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from sentry_sdk import capture_message

from . import serializers


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

        Only throttle requests carrying a participant identifier. The
        identifier is returned by the first request-entry response and
        echoed back by the client from the second request onward, which is
        when throttling starts applying.

        Keying on the identifier rather than the IP address prevents
        penalising multiple users behind the same NAT/proxy, and is
        consistent with how the lobby identifies participants.

        Note: as per DRF documentation, application-level throttling is not a
        security measure against brute-force or DoS attacks. This throttle exists
        solely to guard against accidental hammering from buggy clients.
        """

        if request.user and request.user.is_authenticated:
            return None  # Only throttle unauthenticated requests.

        serializer = serializers.RequestEntrySerializer(data=request.data)
        if not serializer.is_valid():
            return None

        participant_id = serializer.validated_data.get("participant_id")

        if not participant_id:
            return None  # No throttling for unidentified requests

        return self.cache_format % {
            "scope": self.scope,
            "ident": participant_id,
        }


class CreationCallbackAnonRateThrottle(MonitoredAnonRateThrottle):
    """Throttle Anonymous user requesting room generation callback"""

    scope = "creation_callback"


class ExchangeAccessTokenAnonRateThrottle(MonitoredAnonRateThrottle):
    """Throttle anonymous transit code exchange attempts.

    Abuse mitigation only, not a security boundary: DRF throttling is
    best-effort. The security of the exchange rests on the codes'
    entropy and single use.
    """

    scope = "exchange_access_token"
