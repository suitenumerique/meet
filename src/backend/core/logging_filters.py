"""Logging filters for the core application."""

import logging

from django.conf import settings


class SilenceExpected401(logging.Filter):
    """Drop the expected 401 from anonymous hits on the /me endpoint.

    The frontend probes `/users/me/` to check authentication; a 401 for
    anonymous users is normal, not a warning worth logging.
    """

    def filter(self, record):
        """Return False for a 401 on a silenced path, True otherwise."""
        if getattr(record, "status_code", None) != 401:
            return True

        request = getattr(record, "request", None)
        path = getattr(request, "path", None)
        if not path:
            return True

        return path not in settings.LOGGING_SILENCED_401_PATHS
