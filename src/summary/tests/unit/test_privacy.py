"""Regression tests for observability privacy boundaries."""

import logging
from unittest.mock import Mock

import pytest
import requests

from summary.core import analytics, celery_worker, webhook_service
from summary.core.llm_service import LLMException, LLMService
from summary.core.privacy import redact_url
from summary.core.shared_models import SummarizeWebhookSuccessPayload

CANARY = "sensitive-canary"
URL = f"https://user:password@example.com/file?signature={CANARY}#fragment"


def test_url_redaction():
    """Credentials and signed query strings are removed."""
    assert redact_url(URL) == "https://example.com/file?[redacted]"


def test_llm_exception_does_not_include_upstream_message(caplog):
    """LLM failures retain their category without logging upstream text."""
    observability = Mock(is_enabled=False)
    observability.get_openai_client.return_value.chat.completions.create.side_effect = (
        ValueError(CANARY)
    )
    with caplog.at_level(logging.DEBUG), pytest.raises(LLMException) as exc:
        LLMService(observability).call("system", CANARY, "test")
    assert CANARY not in str(exc.value)
    assert CANARY not in caplog.text
    assert exc.value.__suppress_context__


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


def test_analytics_failure_does_not_chain_payload(monkeypatch):
    """Analytics errors do not expose arbitrary client exception text."""
    client = analytics.Analytics()
    client._client = Mock()
    client._client.capture.side_effect = ValueError(CANARY)
    with pytest.raises(analytics.AnalyticsException) as exc:
        client.capture("event", "user")
    assert CANARY not in str(exc.value)
    assert exc.value.__suppress_context__


@pytest.mark.parametrize("log_level", [logging.DEBUG, logging.INFO, logging.ERROR])
def test_celery_log_filter_respects_log_level(log_level):
    """Celery trace values remain available in DEBUG only."""
    record = logging.LogRecord(
        "celery.app.trace", log_level, "", 0, "%s", (CANARY,), None
    )
    record.data = {"name": "task", "id": "job", "return_value": URL}
    assert celery_worker.CeleryLogPrivacyFilter().filter(record)
    if log_level == logging.DEBUG:
        assert CANARY in record.getMessage()
        assert record.data["return_value"] == URL
    else:
        assert CANARY not in record.getMessage()
        assert record.data == {}


def test_task_arguments_have_private_display_representations(monkeypatch):
    """The actual task arguments are delivered but their event repr is hidden."""
    publish = Mock()
    monkeypatch.setattr(celery_worker.Task, "apply_async", publish)
    task = celery_worker.PrivateTask()
    task.apply_async(args=[CANARY], kwargs={"url": URL})
    assert publish.call_args.kwargs["args"] == [CANARY]
    assert publish.call_args.kwargs["argsrepr"] == "[Filtered]"
    assert publish.call_args.kwargs["kwargsrepr"] == "[Filtered]"


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


def test_invalid_llm_json_is_sanitized():
    """Invalid structured LLM output retains a retryable LLM category."""
    with pytest.raises(LLMException) as exc:
        celery_worker.parse_llm_json(CANARY)
    assert CANARY not in str(exc.value)
    assert exc.value.__suppress_context__


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
