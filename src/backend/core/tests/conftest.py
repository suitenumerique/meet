"""Fixtures for tests in the Meet core application"""

from unittest import mock

import pytest
from cryptography.fernet import Fernet
from dockerflow.logging import request_id_context

from core.audit.testing import capture_audit
from core.utils import get_cipher_suite

USER = "user"
TEAM = "team"
VIA = [USER, TEAM]


@pytest.fixture
def mock_user_get_teams():
    """Mock for the "get_teams" method on the User model."""
    with mock.patch("core.models.User.get_teams") as mock_get_teams:
        yield mock_get_teams


@pytest.fixture
def encryption_key(settings):
    """Configure the key encrypting tokens at rest, e.g. on recording deliveries."""
    settings.OIDC_STORE_REFRESH_TOKEN_KEY = Fernet.generate_key().decode()
    get_cipher_suite.cache_clear()
    yield settings.OIDC_STORE_REFRESH_TOKEN_KEY
    get_cipher_suite.cache_clear()


@pytest.fixture
def audit_events():
    """Collect the audit events emitted during the test, as dicts."""
    with capture_audit() as events:
        yield events


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
