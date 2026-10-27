"""Regression tests for observability privacy boundaries."""

from unittest.mock import Mock

import pytest

from summary.core import analytics
from summary.core.privacy import redact_url

CANARY = "sensitive-canary"
URL = f"https://user:password@example.com/file?signature={CANARY}#fragment"


def test_url_redaction():
    """Credentials and signed query strings are removed."""
    assert redact_url(URL) == "https://example.com/file?[redacted]"


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
