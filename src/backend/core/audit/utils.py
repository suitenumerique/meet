"""Value helpers used to assemble audit logs."""

from collections.abc import Mapping
from enum import Enum
from typing import Any

from django.db.models import Model, QuerySet


def render_value(value: Any) -> Any:
    """Render a value as something stable and JSON-friendly.

    Model instances are reduced to their primary key, enums to their value.
    """
    if isinstance(value, Model):
        return str(value.pk)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Mapping):
        return {str(key): render_value(item) for key, item in value.items()}
    if isinstance(value, (QuerySet, list, tuple, set, frozenset)):
        return [render_value(item) for item in value]
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    return str(value)


def exception_type(error: BaseException) -> str:
    """Return the dotted name of an exception's class.

    Audit events record it rather than the message, which may carry personal
    data.
    """
    error_class = type(error)
    return f"{error_class.__module__}.{error_class.__qualname__}"


def prune_empty(value: Any) -> Any:
    """Drop ``None`` values and empty mappings, recursively."""
    if not isinstance(value, Mapping):
        return value
    pruned = {}
    for key, item in value.items():
        cleaned = prune_empty(item)
        if cleaned is None or (isinstance(cleaned, dict) and not cleaned):
            continue
        pruned[key] = cleaned
    return pruned
