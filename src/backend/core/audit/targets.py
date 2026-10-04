"""Describe the resource an audit event is about, as an ECS ``entity.target``.

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

from .actor import user_sub
from .registry import model_options
from .utils import prune_empty, render_value

NAME_FIELD = "name"

_logger = logging.getLogger(__name__)


def _is_user(obj: Any) -> bool:
    return isinstance(obj, get_user_model())


def describe_target(obj: Any) -> dict[str, Any]:
    """Return the ``entity.target`` fields of a target.

    ``id`` is its primary key and ``sub_type`` its model name. ``type`` is the
    ECS entity type registered for its model, ``user`` for a user. A
    registered field called ``name`` is reported as ``name``, the others
    under ``raw``, as the OIDC sub of a user. Empty values are left out, as is
    a registered field that cannot be read, which is reported.
    A mapping is taken as already described.
    """
    if isinstance(obj, Mapping):
        return dict(obj)
    if not isinstance(obj, Model):
        return {"id": str(obj), "sub_type": obj.__class__.__name__.lower()}

    meta = obj._meta  # noqa: SLF001
    options = model_options(meta.model)
    entity_type = options.entity_type or ("user" if _is_user(obj) else None)
    raw: dict[str, Any] = {}
    for name in options.fields:
        try:
            raw[name] = render_value(getattr(obj, name))
        except Exception:  # pylint: disable=broad-exception-caught
            _logger.exception(
                "Audit field %r of %s could not be read", name, meta.label
            )
    if _is_user(obj):
        raw["sub"] = user_sub(obj)
    return prune_empty(
        {
            "id": str(obj.pk) if obj.pk is not None else None,
            "type": [entity_type] if entity_type else None,
            "sub_type": meta.model_name,
            "name": raw.pop(NAME_FIELD, None),
            "raw": raw,
        }
    )
