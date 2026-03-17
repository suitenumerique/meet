"""Integration test configuration. Provides shared fixtures."""

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from summary.core.config import AuthorizedTenant, Settings, get_settings
from summary.main import app


def get_settings_override():
    """Return settings for tests."""
    return Settings(
        v1_tenant_id="test-tenant",
        authorized_tenants=(
            AuthorizedTenant(
                webhook_url="https://example.com/webhook",
                id="test-tenant",
                api_key=SecretStr("test-api-token"),
                webhook_api_key=SecretStr("test-webhook-api-key"),
            ),
        ),
    )


@pytest.fixture()
def client():
    """Provide a FastAPI TestClient for tests."""
    client = TestClient(app)
    app.dependency_overrides[get_settings] = get_settings_override

    return client
