"""Structured audit logging."""

# Audit helpers intentionally expose many optional keyword fields.
# pylint: disable=R0913,R0917
# ruff: noqa: PLR0913

import json
import logging
from datetime import datetime, timezone
from functools import partialmethod
from typing import TYPE_CHECKING, Any, Protocol

from django.http import HttpRequest

AUDIT_LOGGER_NAME = "audit"


def resolve_source_ip(request: HttpRequest):
    """Return the best-effort client IP for ``request``.

    Reads the original client from ``X-Forwarded-For`` when present,
    falling back to ``REMOTE_ADDR``.

    NB: behind a proxy/load-balancer chain, correctness depends on the ingress
    being configured to set and trust ``X-Forwarded-For``. Confirm the
    trusted-proxy chain before relying on this value for security decisions.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def extract_request_fields(request: HttpRequest) -> dict[str, Any]:
    """Return the audit fields derivable from ``request``."""
    meta = request.META
    return {
        "source_ip": resolve_source_ip(request),
        "source_port": meta.get("REMOTE_PORT"),
        "request_path": request.path,
        "request_url": request.build_absolute_uri(),
        "request_method": request.method,
        "request_body_bytes": meta.get("CONTENT_LENGTH"),
        "http_version": meta.get("SERVER_PROTOCOL"),
        "user_agent": meta.get("HTTP_USER_AGENT"),
        "referer": meta.get("HTTP_REFERER"),
        "server_user": meta.get("REMOTE_USER"),
    }


class AuditJsonFormatter(logging.Formatter):
    """Render audit records as single-line JSON.

    Read the structured payload attached to the record under ``audit`` and
    wrap it in a small envelope.
    """

    def format(self, record):
        payload = {"log_type": "audit"}

        audit = getattr(record, "audit", None)
        if isinstance(audit, dict):
            payload.update(audit)
        else:
            payload["event_type"] = record.getMessage()

        payload.setdefault(
            "timestamp",
            datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
        )
        payload["level"] = record.levelname
        payload["logger"] = record.name

        # ``default=str`` serialises UUIDs, datetimes, etc.; ``ensure_ascii``
        # off keeps emails and non-ASCII identifiers readable.
        return json.dumps(payload, default=str, ensure_ascii=False)


class _AuditEmit(Protocol):
    """Public signature shared by the per-level audit methods.

    Declared so editors and type checkers see the real keyword fields despite using `partialwrapper`.
    """

    def __call__(
        self,
        event_type: str,
        *,
        auth_type: str | None = ...,
        actor: dict[str, Any] | None = ...,
        source_ip: str | None = ...,
        target: dict[str, Any] | None = ...,
        request: HttpRequest | None = ...,
        **extra: Any,
    ) -> None:
        pass


class AuditLogger:
    """Wrapper around the named ``audit`` logger."""

    def __init__(
        self,
        logger_name=AUDIT_LOGGER_NAME,
        custom_serializers: list[tuple] | None = None,
    ):
        self._logger = logging.getLogger(logger_name)
        self._serializers = []
        if custom_serializers is not None:
            self._serializers = custom_serializers

    def _emit(
        self,
        level,
        event_type,
        request: HttpRequest | None,  # Intentionnaly mandatory
        *,
        exc_info: bool = False,
        **extra,
    ):
        """Assemble the structured payload and emit it on the audit logger.

        ``exc_info`` is forwarded to the stdlib logger (set by ``exception``) so
        the active traceback is captured; it is a logging concern and never
        enters the audit payload.
        """

        request_fields = extract_request_fields(request) if request is not None else {}

        # Create fields from custom serializers
        new_extra = {}
        for key, value in extra.items():
            for cls, serializer in self._serializers:
                if isinstance(value, cls):
                    new_extra = new_extra | {
                        f"{key}.{ser_key}": ser_field
                        for ser_key, ser_field in serializer(value).items()
                    }
                    break
            else:
                new_extra[key] = value

        audit = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            **request_fields,
            **new_extra,
        }
        audit = {key: value for key, value in audit.items() if value is not None}

        self._logger.log(level, event_type, extra={"audit": audit}, exc_info=exc_info)

    # One public method per standard logging level, all sharing ``_emit``.
    # The ``TYPE_CHECKING`` declarations expose the real signature to editors;
    # the ``else`` branch is what runs, binding the level via ``partialmethod``.
    if TYPE_CHECKING:
        debug: _AuditEmit
        info: _AuditEmit
        warning: _AuditEmit
        error: _AuditEmit
        critical: _AuditEmit
        # ``exception`` mirrors stdlib: ERROR level with the active traceback.
        exception: _AuditEmit
    else:
        debug = partialmethod(_emit, logging.DEBUG)
        info = partialmethod(_emit, logging.INFO)
        warning = partialmethod(_emit, logging.WARNING)
        error = partialmethod(_emit, logging.ERROR)
        critical = partialmethod(_emit, logging.CRITICAL)
        exception = partialmethod(_emit, logging.ERROR, exc_info=True)


def getLogger(
    name: str | None = None, custom_serializers: list[tuple | None] = None
) -> AuditLogger:
    """Return an :class:`AuditLogger`, mirroring :func:`logging.getLogger`.

    Pass ``__name__`` to tag audit records with the calling module while still
    emitting on the dedicated ``audit`` handler::

        from core import audit

        logger = audit.getLogger(__name__)
        logger.info("external_api.token.issued", ...)

    Names are nested under ``AUDIT_LOGGER_NAME`` (e.g. ``audit.core.foo``) so
    they inherit its handlers through the standard logging hierarchy, keeping
    the module visible in the ``logger`` field of the emitted JSON.
    """
    if not name or name == AUDIT_LOGGER_NAME:
        return AuditLogger(AUDIT_LOGGER_NAME, custom_serializers=custom_serializers)
    return AuditLogger(
        f"{AUDIT_LOGGER_NAME}.{name}", custom_serializers=custom_serializers
    )
