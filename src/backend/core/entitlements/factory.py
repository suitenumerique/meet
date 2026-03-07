"""Factory for creating entitlements backend instances."""

import functools

from django.conf import settings
from django.utils.module_loading import import_string


@functools.cache
def get_entitlements_backend():
    """Return a singleton instance of the configured entitlements backend."""
    backend_class = import_string(settings.ENTITLEMENTS_BACKEND)
    return backend_class(**settings.ENTITLEMENTS_BACKEND_PARAMETERS)
