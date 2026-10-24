"""Tests for the Dockerflow health endpoints backing the Kubernetes probes."""

from unittest import mock

from django.core import checks
from django.test.utils import override_settings

import pytest
from dockerflow.django.views import django_check_registry

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("path", ["/__lbheartbeat__", "/__heartbeat__"])
def test_dockerflow_endpoints_are_anonymous(client, path):
    """Both endpoints answer without authentication."""
    response = client.get(path)

    assert response.status_code == 200


def test_dockerflow_lbheartbeat_is_a_liveness_signal(client, django_assert_num_queries):
    """The load balancer heartbeat answers 200 without touching the database."""
    with django_assert_num_queries(0):
        response = client.get("/__lbheartbeat__")

    assert response.status_code == 200


def test_dockerflow_lbheartbeat_ignores_allowed_hosts(client):
    """The probes are served before ALLOWED_HOSTS is enforced."""
    response = client.get("/__lbheartbeat__", headers={"host": "1.2.3.4:8000"})

    assert response.status_code == 200


def test_dockerflow_heartbeat_reports_the_configured_checks(client):
    """The heartbeat runs the database, migrations and redis checks."""
    with override_settings(DEBUG=True):
        response = client.get("/__heartbeat__")

    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["details"] == {}
    assert payload["checks"]["check_database_connected"] == "ok"
    assert payload["checks"]["check_migrations_applied"] == "ok"


def test_dockerflow_heartbeat_is_a_readiness_signal(client):
    """A check reporting an error takes the heartbeat down with a 500."""

    def failing_check(**kwargs):
        return [checks.Error("Could not connect to database", id="health.E001")]

    with mock.patch.object(
        django_check_registry, "get_checks", return_value=[failing_check]
    ):
        response = client.get("/__heartbeat__")

    assert response.status_code == 500
    assert response.json()["status"] == "error"


def test_dockerflow_heartbeat_tolerates_warnings(client):
    """A warning in the check should not affect the probes."""

    def warning_check(**kwargs):
        return [checks.Warning("Unapplied migration", id="health.W001")]

    with mock.patch.object(
        django_check_registry, "get_checks", return_value=[warning_check]
    ):
        response = client.get("/__heartbeat__")

    assert response.status_code == 200
    assert response.json()["status"] == "warning"
