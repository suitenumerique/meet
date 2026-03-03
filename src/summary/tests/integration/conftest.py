"""Integration test configuration — auto-marks and provides shared fixtures."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from summary.main import app

INTEGRATION_DIR = Path(__file__).parent


def pytest_collection_modifyitems(items):
    """Add the 'integration' marker to every test in the integration directory."""
    for item in items:
        if INTEGRATION_DIR in item.path.parents:
            item.add_marker(pytest.mark.integration)


@pytest.fixture()
def client():
    """Provide a FastAPI TestClient for integration tests."""
    return TestClient(app)
