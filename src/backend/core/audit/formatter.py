"""Render audit records as single-line ECS JSON format."""

import json
import logging
from datetime import datetime, timezone
from typing import Any


class AuditJsonFormatter(logging.Formatter):
    """Serialise the document attached to the record under ``audit`` in ECS format."""

    def format(self, record: logging.LogRecord) -> str:
        document = getattr(record, "audit", None)
        if not isinstance(document, dict):
            document = {
                "@timestamp": datetime.fromtimestamp(
                    record.created, tz=timezone.utc
                ).isoformat(timespec="milliseconds"),
                "log_type": "audit",
                "message": record.getMessage(),
                "event": {"action": record.getMessage()},
            }

        document = {
            **document,
            "log": {"level": record.levelname.lower(), "logger": record.name},
        }
        if record.exc_info:
            error: dict[str, Any] = dict(document.get("error") or {})
            error["stack_trace"] = self.formatException(record.exc_info)
            document["error"] = error

        return json.dumps(
            document, ensure_ascii=False, default=str, separators=(",", ":")
        )
