"""Service for delivering content to external destinations."""

import json
import logging
from urllib.parse import urljoin

from requests import Session
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from summary.core.config import get_settings

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
        session.headers.update(
            {
                "Authorization": f"Bearer {api_key}",
                "User-Agent": settings.app_external_user_agent,
            }
        )
    return session


def _post_with_retries(*, url, data, api_key: str | None = None):
    """Send POST request with automatic retries."""
    session = _create_retry_session(api_key=api_key)

    try:
        response = session.post(url, json=data, timeout=(20, 3 * 60))
        response.raise_for_status()
        return response
    finally:
        session.close()


def create_document_in_lasuite_docs(
    *, content: str, title: str, email: str, sub: str
) -> None:
    """Call the Docs API to create a document on behalf of the user there.

    Builds the payload, sends it with retries, and logs the outcome.
    """
    data = {
        "title": title,
        "content": content,
        "email": email,
        "sub": sub,
    }

    logger.debug(
        "Submitting document to docs endpoint: %s", settings.lasuite_docs_base_url
    )
    logger.debug(
        "Docs payload metadata | title_len=%s content_len=%s has_email=%s has_sub=%s",
        len(title),
        len(content),
        bool(email),
        bool(sub),
    )

    response = _post_with_retries(
        url=urljoin(
            settings.lasuite_docs_base_url, "/api/v1.0/documents/create-for-owner/"
        ),
        api_key=settings.lasuite_docs_server_to_server_api_key.get_secret_value(),
        data=data,
    )

    try:
        response_data = response.json()
        document_id = response_data.get("id", "N/A")
    except (json.JSONDecodeError, AttributeError):
        document_id = "Unable to parse response"

    logger.info(
        "Delivery success | Document %s submitted (HTTP %s)",
        document_id,
        response.status_code,
    )
    logger.debug("Docs response received (body omitted)")
