"""Integration test configuration. Provides shared fixtures."""

import pytest
from fastapi.testclient import TestClient

from summary.main import app


@pytest.fixture()
def client():
    """Provide a FastAPI TestClient for integration tests."""
    return TestClient(app)
