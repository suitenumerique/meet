"""Service for delivering content to external destinations."""

import json
import logging

import requests

from summary.core.config import get_settings
from summary.core.shared_models import (
    WebhookPayloads,
)

settings = get_settings()

logger = logging.getLogger(__name__)


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
