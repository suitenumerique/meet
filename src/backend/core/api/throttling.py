"""Throttling handlers for the Meet core app."""

from rest_framework import throttling


class RequestEntryAnonRateThrottle(throttling.AnonRateThrottle):
    """Throttle Anonymous user requesting room entry"""

    scope = "request_entry"


class CreationCallbackAnonRateThrottle(throttling.AnonRateThrottle):
    """Throttle Anonymous user requesting room generation callback"""

    scope = "creation_callback"
