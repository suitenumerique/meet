"""Service for delivering content to external destinations."""

import json
import logging

from requests import Session
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from summary.core.config import get_settings

logger = logging.getLogger(__name__)


def _create_retry_session():
    """Create an HTTP session configured with retry logic."""
    session = Session()
    retries = Retry(
        total=get_settings().webhook_max_retries,
        backoff_factor=get_settings().webhook_backoff_factor,
        status_forcelist=get_settings().webhook_status_forcelist,
        allowed_methods={"POST"},
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


def _post_with_retries(url, data):
    """Send POST request with automatic retries."""
    session = _create_retry_session()
    session.headers.update(
        {
            "Authorization": f"Bearer {get_settings().webhook_api_token.get_secret_value()}"  # noqa: E501
        }
    )
    try:
        response = session.post(url, json=data)
        response.raise_for_status()
        return response
    finally:
        session.close()


def submit_content(content, title, email, sub):
    """Submit content to the configured webhook destination.

    Builds the payload, sends it with retries, and logs the outcome.
    """
    data = {
        "title": title,
        "content": content,
        "email": email,
        "sub": sub,
    }

    logger.debug("Submitting to %s", get_settings().webhook_url)
    logger.debug("Request payload: %s", json.dumps(data, indent=2))

    response = _post_with_retries(get_settings().webhook_url, data)

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
