"""Tests for the health check endpoints."""

from unittest import mock

import pytest
from celery.exceptions import OperationalError


@pytest.fixture(name="broker")
def fixture_broker():
    """Patch the Celery broker connection the heartbeat check opens."""
    with mock.patch("summary.core.checks.celery.connection_for_write") as connect:
        connection = connect.return_value
        connection.__enter__.return_value = connection
        yield connection


class TestLBHeartbeat:
    """Tests for the /__lbheartbeat__ endpoint."""

    def test_returns_200(self, client, broker):
        """The LB heartbeat endpoint responds with 200 OK without an api_key."""
        response = client.get("/__lbheartbeat__")

        broker.ensure_connection.assert_not_called()
        assert response.status_code == 200


class TestHeartbeat:
    """Tests for the /__heartbeat__ endpoint."""

    def test_returns_200(self, client, broker):
        """The heartbeat endpoint responds with 200 OK without an api_key."""
        response = client.get("/__heartbeat__")

        assert response.status_code == 200
        assert response.json()["checks"]["broker_connected"] == "ok"
        broker.ensure_connection.assert_called_once_with(max_retries=0)

    def test_returns_500_when_the_broker_is_unreachable(self, client, broker):
        """An unreachable celery broker takes the readiness probe down."""
        broker.ensure_connection.side_effect = OperationalError("Connection refused")

        response = client.get("/__heartbeat__")

        assert response.status_code == 500

        payload = response.json()
        assert payload["status"] == "error"
        assert payload["checks"]["broker_connected"] == "error"
        assert (
            payload["details"]["broker_connected"]["messages"]["summary.health.E001"]
            == "Connection refused"
        )
