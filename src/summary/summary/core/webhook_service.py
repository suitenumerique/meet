"""Service for delivering content to external destinations."""

import json
import logging

import requests
from requests import Session
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from summary.core.config import get_settings
from summary.core.shared_models import (
    WebhookPayloads,
)

settings = get_settings()

logger = logging.getLogger(__name__)


def _create_retry_session(api_key: str | None = None):
    """Create an HTTP session configured with retry logic."""
    session = Session()
    retries = Retry(
        total=settings.webhook_max_retries,
        backoff_factor=settings.webhook_backoff_factor,
        status_forcelist=settings.webhook_status_forcelist,
        allowed_methods={"POST"},
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    if api_key:
        session.headers.update({"Authorization": f"Bearer {api_key}"})

    return session


def _post_with_retries(*, url, data, api_key: str | None = None):
    """Send POST request with automatic retries."""
    session = _create_retry_session(api_key=api_key)

    try:
        response = session.post(url, json=data)
        response.raise_for_status()
        return response
    finally:
        session.close()


def call_webhook_v2(
    *,
    tenant_id: str,
    payload: WebhookPayloads,
) -> None:
    """Call webhook with a payload to a specific tenant.

    Request is performed without retry, retry should be handled at the task level.
    """
    tenant = settings.get_authorized_tenant(tenant_id=tenant_id)

    logger.debug("Submitting to %s", tenant.webhook_url)
    logger.debug("Request payload: %s", payload.model_dump_json(indent=2))

    response = requests.post(
        tenant.webhook_url,
        json=payload.model_dump(),
        headers={
            "Authorization": f"Bearer {tenant.webhook_api_key.get_secret_value()}",
        },
        timeout=(10, 20),
    )
    response.raise_for_status()

    try:
        response_data = response.json()
        document_id = response_data.get("id", "N/A")
    except (json.JSONDecodeError, AttributeError):
        document_id = "Unable to parse response"
        response_data = response.text

    logger.info(
        "Delivery success | Document %s submitted (HTTP %s)",
        document_id,
        response.status_code,
    )
    logger.debug("Full response: %s", response_data)
