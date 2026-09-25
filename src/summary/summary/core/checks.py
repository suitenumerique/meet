"""Dockerflow checks backing the /__heartbeat__ endpoint."""

from celery.exceptions import OperationalError
from dockerflow import checks

from summary.core.celery_worker import celery

BROKER_SOCKET_TIMEOUT = 2  # Should be under the readiness probe timeout (5s)


@checks.register(name="broker_connected")
def check_broker_connected():
    """Report whether the Celery broker accepts a connection."""
    try:
        with celery.connection_for_write(
            transport_options={
                "socket_connect_timeout": BROKER_SOCKET_TIMEOUT,
                "socket_timeout": BROKER_SOCKET_TIMEOUT,
            }
        ) as connection:
            connection.ensure_connection(max_retries=0)
    except OperationalError as exc:
        return [checks.Error(str(exc), id="summary.health.E001")]
    return []
