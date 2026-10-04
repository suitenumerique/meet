"""Helpers for asserting on audit events in tests."""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict
from typing import Any

from . import registry
from .actions import Action
from .emitter import AUDIT_LOGGER_NAME


class _CollectingHandler(logging.Handler):
    """Keep the documents attached to the records it receives."""

    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.documents: list[dict[str, Any]] = []

    def emit(self, record: logging.LogRecord) -> None:
        document = getattr(record, "audit", None)
        if not isinstance(document, dict):
            document = {"message": record.getMessage()}
        self.documents.append({**document, "log": {"level": record.levelname.lower()}})


@contextmanager
def capture_audit() -> Iterator[list[dict[str, Any]]]:
    """Collect the audit documents emitted inside the block"""
    logger = logging.getLogger(AUDIT_LOGGER_NAME)
    handler = _CollectingHandler()
    previous_level = logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    try:
        yield handler.documents
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)


def find_events(
    events: list[dict[str, Any]], action: Action | str
) -> list[dict[str, Any]]:
    """Return the captured events whose ``event.action`` is ``action``."""
    return [
        event for event in events if event.get("event", {}).get("action") == str(action)
    ]


@contextmanager
def override_registration(model, **options) -> Iterator[None]:
    """Register ``model`` with ``options`` inside the block, whatever it was before."""
    previous = registry.unregister(model)
    registry.register(model, **options)
    try:
        yield
    finally:
        registry.unregister(model)
        if previous is not None:
            registry.register(model, **asdict(previous))
