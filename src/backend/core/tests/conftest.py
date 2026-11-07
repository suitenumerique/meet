"""Fixtures for tests in the Meet core application"""

import json
from unittest import mock

import pytest
from dockerflow.logging import request_id_context

from core.audit.testing import capture_audit
from core.livekit.clusters import get_livekit_clusters
from core.services.room_management import RoomManagement
from core.tests.utils import CREATED_LIVEKIT_ROOM_SID, livekit_cluster_entry

USER = "user"
TEAM = "team"
VIA = [USER, TEAM]


def pytest_configure(config):
    """Register the markers of the tests in the Meet core application."""
    config.addinivalue_line(
        "markers",
        "real_livekit_room_creation: create LiveKit rooms through the LiveKit "
        "API rather than the fake_livekit_room_creation fixture",
    )


@pytest.fixture
def mock_user_get_teams():
    """Mock for the "get_teams" method on the User model."""
    with mock.patch("core.models.User.get_teams") as mock_get_teams:
        yield mock_get_teams


@pytest.fixture
def audit_events():
    """Collect the audit events emitted during the test, as dicts."""
    with capture_audit() as events:
        yield events


@pytest.fixture(autouse=True)
def fake_livekit_room_creation(request):
    """Create LiveKit rooms without calling LiveKit.

    Credentials are handed out only once the LiveKit room is created on its
    cluster, so every join would otherwise call LiveKit. Each LiveKit room
    created gets CREATED_LIVEKIT_ROOM_SID as SID. Return the mock standing for
    RoomManagement.create_room, or None in tests marked
    real_livekit_room_creation, which go through the real one.
    """
    if request.node.get_closest_marker("real_livekit_room_creation"):
        yield None
        return
    with mock.patch.object(
        RoomManagement,
        "create_room",
        return_value=CREATED_LIVEKIT_ROOM_SID,
    ) as create_room:
        yield create_room


@pytest.fixture(autouse=True)
def isolated_request_id():
    """Keep dockerflow's request id from leaking from one test to the next.

    Its middleware sets the context variable on every request the test client
    makes and never clears it, which would make the trace id of a later test
    depend on the order tests ran in.
    """
    token = request_id_context.set(None)
    yield
    request_id_context.reset(token)


@pytest.fixture
def two_livekit_clusters(settings):
    """Register the Paris and Lyon LiveKit clusters, Paris being the default.

    Each has its own API key and secret. Return both clusters, Paris first.
    """
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon")]
    )
    return get_livekit_clusters()
