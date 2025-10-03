# core/api/feature_flag.py
import logging
import os
from functools import wraps
from logging import getLogger

from django.conf import settings
from django.http import Http404

logging.basicConfig(level=logging.DEBUG)

logger = getLogger(__name__)

from posthog import Posthog


class FeatureFlagError(Exception):
    """Feature flag management error."""


class FeatureFlag:
    """Feature flag management using Django settings and PostHog."""

    FLAGS = {
        "metadata_agent": {"posthog": "is_metadata_agent_enabled"},
        "recording": {"setting": "RECORDING_ENABLE"},
        "storage_event": {"setting": "RECORDING_STORAGE_EVENT_ENABLE"},
        "subtitle": {"setting": "ROOM_SUBTITLE_ENABLED"},
    }

    _ph_client = None

    @classmethod
    def _get_ph_client(cls):
        """Initialize and return PostHog client if configured."""
        if cls._ph_client is not None:
            return cls._ph_client
        api_key = os.getenv("POSTHOG_API_KEY")
        host = os.getenv("POSTHOG_API_HOST", "https://eu.i.posthog.com")
        logging.info("PostHog config: api_key=%s, host=%s", api_key, host)
        if Posthog and api_key and host:
            logging.info("Initializing PostHog client")
            cls._ph_client = Posthog(project_api_key=api_key, host=host)
        logging.info("PostHog client initialized: %s", bool(cls._ph_client))
        return cls._ph_client

    @classmethod
    def flag_is_active(cls, flag_name, *, distinct_id=None, default=False):
        """Check if a feature flag is active."""
        cfg = cls.FLAGS.get(flag_name)
        if not cfg:
            return False

        setting_name = cfg.get("setting")
        if setting_name is not None:
            return bool(getattr(settings, setting_name, False))

        posthog_flag = cfg.get("posthog")
        if posthog_flag:
            ph = cls._get_ph_client()
            if ph and distinct_id:
                try:
                    logger.info(
                        "Checking PostHog flag %s for id=%s", posthog_flag, distinct_id
                    )
                    return bool(ph.feature_enabled(posthog_flag, distinct_id))
                except FeatureFlagError as e:
                    logging.error("Error checking feature flag %s: %s", flag_name, e)
                    return default
            return default
        return default

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
