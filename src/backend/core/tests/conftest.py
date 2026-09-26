"""Fixtures for tests in the Meet core application"""

from unittest import mock

from django.core.cache import cache

import pytest

USER = "user"
TEAM = "team"
VIA = [USER, TEAM]


@pytest.fixture
def mock_user_get_teams():
    """Mock for the "get_teams" method on the User model."""
    with mock.patch("core.models.User.get_teams") as mock_get_teams:
        yield mock_get_teams


@pytest.fixture
def local_cache(settings):
    """A cache in this process alone, for tests that clear it or read it back.

    The suite runs under xdist and the session backend lives in the shared
    cache, so clearing that one logs out whatever runs in the other worker.
    """
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "local_cache",
        }
    }
    cache.clear()
