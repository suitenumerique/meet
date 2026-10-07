"""Describe the resource an audit event is about.

The fields describing each model are those registered for it, see
``core.audit.registry``. A target is always identified by its model name and
primary key, so a model that is not registered is still identifiable, just
less detailed.
"""

import logging
from collections.abc import Mapping
from typing import Any

from django.contrib.auth import get_user_model
from django.db.models import Model

from .actor import describe_user
from .registry import model_options
from .utils import render_value

_logger = logging.getLogger(__name__)


def describe_target(obj: Any) -> dict[str, Any]:
    """Return ``{"type": ..., "id": ..., **fields}`` for a target.

    A user will carries its OIDC sub and its email domain.
    A registered field that cannot be read is left out and simply reported.
    """
    if isinstance(obj, Mapping):
        return dict(obj)
    if not isinstance(obj, Model):
        return {"type": obj.__class__.__name__.lower(), "id": str(obj)}

    meta = obj._meta  # noqa: SLF001
    document: dict[str, Any] = {
        "type": meta.model_name,
        "id": str(obj.pk) if obj.pk is not None else None,
    }
    for name in model_options(meta.model).fields:
        try:
            document[name] = render_value(getattr(obj, name))
        except Exception:  # pylint: disable=broad-exception-caught
            _logger.exception(
                "Audit field %r of %s could not be read", name, meta.label
            )
    if isinstance(obj, get_user_model()):
        document |= describe_user(obj)
    return document
