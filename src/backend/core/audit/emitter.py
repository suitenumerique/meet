"""Build ECS audit documents and emit them on the ``audit`` logger."""

import inspect
import logging
from datetime import datetime, timezone
from typing import Any

from django.conf import settings

from .actions import Action
from .actor import describe_actor
from .enums import ActorType, EventCategory, EventType, Outcome, Reason
from .request import current_request, current_request_id, resolve_client_ip
from .targets import describe_target
from .utils import prune_empty, render_value

AUDIT_LOGGER_NAME = "audit"
ECS_VERSION = "9.5.0"
LOG_TYPE = "audit"

_audit_logger = logging.getLogger(AUDIT_LOGGER_NAME)
_logger = logging.getLogger(__name__)


def log(action: Action | str, **fields: Any) -> None:
    """Emit one audit event."""
    try:
        document = build_document(action, **fields)
    except Exception:  # pylint: disable=broad-exception-caught
        _logger.exception("Audit event %r could not be built", action)
        return

    _audit_logger.log(
        level_for(document["lasuite"]["outcome"], document["event"].get("reason")),
        str(action),
        extra={"audit": document},
    )


def level_for(outcome: Outcome | str, reason: Reason | str | None) -> int:
    """Derive the logging level so call sites never choose one."""
    if Outcome(outcome) == Outcome.SUCCESS:
        return logging.INFO
    if reason is not None and Reason(reason) == Reason.INTERNAL_ERROR:
        return logging.ERROR
    return logging.WARNING


def build_document(  # noqa: PLR0913  # pylint: disable=too-many-arguments,too-many-locals
    action: Action | str,
    *,
    request: Any = None,
    outcome: Outcome | str = Outcome.SUCCESS,
    reason: Reason | str | None = None,
    category: EventCategory | str | None = None,
    types: list[EventType | str] | None = None,
    target: Any = None,
    actor: Any = None,
    actor_type: ActorType | str | None = None,
    auth_method: str | None = None,
    client_id: str | None = None,
    status_code: int | None = None,
    error: Any = None,
    error_type: str | None = None,
    message: str | None = None,
    **details: Any,
) -> dict[str, Any]:
    """Return the ECS document of an event, pruned of empty values.

    ``action`` is what was attempted: an ``Action``, whose category and types
    apply unless given here, or a bare dotted name (``room.create``).
    The actor, auth method and network fields are read from ``request``, by
    default the request being served.
    ``actor``, ``actor_type``, ``auth_method`` and ``client_id`` override them.
    ``target`` is the resource acted on. Any other keyword argument lands under
    ``lasuite.details``.
    """
    if request is None:
        request = current_request()
    outcome = Outcome(outcome)
    reason = Reason(reason) if reason is not None else None
    if isinstance(action, Action):
        category = category or action.category
        types = types or list(action.types)
    client_ip = resolve_client_ip(request) if request is not None else None
    actor_fields = describe_actor(
        request,
        actor=actor,
        actor_type=actor_type,
        client_id=client_id,
        auth_method=auth_method,
    )

    return prune_empty(
        {
            "@timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "ecs": {"version": ECS_VERSION},
            "log_type": LOG_TYPE,
            "message": message,
            "service": {
                "name": getattr(settings, "AUDIT_LOG_SERVICE_NAME", None),
                "environment": getattr(settings, "ENVIRONMENT", None),
            },
            "event": _event_fields(action, outcome, reason, category, types),
            "trace": {"id": current_request_id()},
            "client": {"ip": client_ip},
            "source": {"ip": client_ip},
            "http": {
                "request": {"method": getattr(request, "method", None)},
                "response": {"status_code": status_code},
            },
            "url": {"path": getattr(request, "path", None) or None},
            "user": actor_fields["user"],
            "organization": actor_fields["organization"],
            "lasuite": {
                **actor_fields["lasuite"],
                "outcome": str(outcome),
                "target": describe_target(target) if target is not None else None,
                "details": render_value(details),
            },
            "error": {
                "message": str(error) if error is not None else None,
                "type": error_type,
            },
        }
    )


# The keyword arguments of ``log`` that fill an event field rather than a detail
EVENT_FIELDS = frozenset(
    name
    for name, parameter in inspect.signature(build_document).parameters.items()
    if parameter.kind is inspect.Parameter.KEYWORD_ONLY
)


def _event_fields(action, outcome, reason, category, types) -> dict[str, Any]:
    type_list = [str(EventType(item)) for item in (types or [])]
    if not type_list:
        type_list = [str(_default_type(outcome))]
    if outcome == Outcome.DENIED and str(EventType.DENIED) not in type_list:
        type_list.append(str(EventType.DENIED))

    return {
        "kind": "event",
        "action": str(action),
        "category": [str(EventCategory(category or EventCategory.WEB))],
        "type": type_list,
        "outcome": "success" if outcome == Outcome.SUCCESS else "failure",
        "reason": str(reason) if reason is not None else None,
    }


def _default_type(outcome: Outcome) -> EventType:
    if outcome == Outcome.SUCCESS:
        return EventType.INFO
    if outcome == Outcome.DENIED:
        return EventType.DENIED
    return EventType.ERROR
