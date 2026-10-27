"""Regression tests for observability privacy boundaries."""

import logging
from unittest.mock import Mock

import pytest
import requests

from summary.core import analytics, webhook_service
from summary.core.privacy import redact_url
from summary.core.shared_models import SummarizeWebhookSuccessPayload

CANARY = "sensitive-canary"
URL = f"https://user:password@example.com/file?signature={CANARY}#fragment"


def test_url_redaction():
    """Credentials and signed query strings are removed."""
    assert redact_url(URL) == "https://example.com/file?[redacted]"


@pytest.mark.parametrize("log_level", [logging.DEBUG, logging.INFO])
def test_webhook_content_is_only_logged_at_debug(
    monkeypatch, caplog, settings_override, log_level
):
    """DEBUG retains response content; INFO and above only contain metadata."""
    monkeypatch.setattr(webhook_service, "settings", settings_override)
    response = Mock(status_code=200)
    response.json.return_value = {"id": "document-123", "content": CANARY}
    monkeypatch.setattr(webhook_service.requests, "post", Mock(return_value=response))
    payload = SummarizeWebhookSuccessPayload(job_id="job", summary_data_url=URL)
    with caplog.at_level(log_level):
        webhook_service.call_webhook_v2(tenant_id="test-tenant", payload=payload)
    assert (
        webhook_service.requests.post.call_args.kwargs["json"]["summary_data_url"]
        == URL
    )
    assert all(
        CANARY not in record.getMessage()
        for record in caplog.records
        if record.levelno >= logging.INFO
    )
    if log_level == logging.DEBUG:
        assert any(
            record.levelno == logging.DEBUG and CANARY in record.getMessage()
            for record in caplog.records
        )
    else:
        assert CANARY not in caplog.text
    assert "Document document-123 submitted (HTTP 200)" in caplog.text


def test_webhook_failure_keeps_retry_category(monkeypatch, settings_override):
    """Webhook exceptions remain retryable without upstream text."""
    monkeypatch.setattr(webhook_service, "settings", settings_override)
    monkeypatch.setattr(
        webhook_service.requests,
        "post",
        Mock(side_effect=requests.RequestException(URL)),
    )
    payload = SummarizeWebhookSuccessPayload(job_id="job", summary_data_url=URL)
    with pytest.raises(requests.RequestException) as exc:
        webhook_service.call_webhook_v2(tenant_id="test-tenant", payload=payload)
    assert CANARY not in str(exc.value)
    assert exc.value.__suppress_context__


def test_analytics_source_url_removes_signature():
    """Task analytics keeps the source path without credentials or signature."""
    from datetime import datetime, timezone  # noqa: PLC0415

    from summary.core.models import TranscribeTaskJob  # noqa: PLC0415

    manager = analytics.MetadataManager()
    manager._is_disabled = False
    manager.has_task_id = Mock(return_value=False)
    manager._save_metadata = Mock()
    payload = TranscribeTaskJob(
        user_sub="user",
        tenant_id="tenant",
        cloud_storage_url=URL,
        language="en",
        received_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    manager.create("job", payload)
    metadata = manager._save_metadata.call_args.args[1]
    assert metadata["source_url"] == "https://example.com/file?[redacted]"
    assert CANARY not in str(metadata)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (None, "[redacted]"),
        ("https://[invalid?secret=value", "[redacted]"),
        ("https://example.com/path#fragment", "https://example.com/path"),
        ("https://example.com/path?", "https://example.com/path?[redacted]"),
    ],
)
def test_redact_url_edge_cases(url, expected):
    """Malformed and non-string URLs do not expose credentials or query data."""
    assert redact_url(url) == expected
