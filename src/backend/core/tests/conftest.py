"""Fixtures for tests in the Meet core application"""

from unittest import mock

import pytest

USER = "user"
TEAM = "team"
VIA = [USER, TEAM]


@pytest.fixture
def mock_user_get_teams():
    """Mock for the "get_teams" method on the User model."""
    with mock.patch("core.models.User.get_teams") as mock_get_teams:
        yield mock_get_teams


@pytest.fixture(autouse=True)
def mock_list_participant_names():
    """Answer "who is in this room" without reaching LiveKit.

    Every path that mints a join token reads the room's roster, so without this
    each test would open a session to the LiveKit URL and wait for it to fail.
    """
    with mock.patch("core.utils.list_participant_names", return_value={}) as mocked:
        yield mocked
