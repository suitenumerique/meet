"""Integration test configuration. Provides shared fixtures."""

import pytest
from fastapi.testclient import TestClient

from summary.core.celery_worker import celery
from summary.main import app


@pytest.fixture()
def client():
    """Provide a FastAPI TestClient for integration tests."""
    return TestClient(app)


@pytest.fixture()
def eager_celery():
    """Run Celery tasks synchronously in the same process."""
    celery.conf.task_always_eager = True
    celery.conf.task_eager_propagates = True
    yield
    celery.conf.task_always_eager = False
    celery.conf.task_eager_propagates = False
