"""Feature flag handler for the Meet core app."""

from functools import wraps

from django.conf import settings
from django.http import Http404


class FeatureFlag:
    """Check if features are enabled and return error responses."""

    FLAGS = {
        "recording": "RECORDING_ENABLE",
        "storage_event": "RECORDING_STORAGE_EVENT_ENABLE",
        "subtitle": "ROOM_SUBTITLE_ENABLED",
    }

    @classmethod
    def flag_is_active(cls, flag_name):
        """Check if a feature flag is active."""

        setting_name = cls.FLAGS.get(flag_name)

        if setting_name is None:
            return False

        return getattr(settings, setting_name, False)

    @classmethod
    def require(cls, flag_name):
        """Decorator to check feature at the beginning of endpoint methods."""

        if flag_name not in cls.FLAGS:
            raise ValueError(f"Unknown feature flag: {flag_name}")

        def decorator(view_func):
            @wraps(view_func)
            def wrapper(self, request, *args, **kwargs):
                if not cls.flag_is_active(flag_name):
                    raise Http404
                return view_func(self, request, *args, **kwargs)

            return wrapper

        return decorator
