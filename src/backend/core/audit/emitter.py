"""Build ECS audit documents and emit them on the ``audit`` logger."""

import functools
import inspect
import logging
import socket
import uuid
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any

from django.conf import settings

from .actions import Action
from .actor import FROM_REQUEST, describe_actor
from .ecs import (
    DEFAULT_CATEGORY,
    ECS_VERSION,
    check_classification,
    is_expected,
    stream_fields,
)
from .enums import ActorType, EventCategory, EventType, Outcome, Reason
from .request import RequestContext, request_context
from .targets import describe_target
from .utils import prune_empty, render_value

AUDIT_LOGGER_NAME = "audit"

audit_logger = logging.getLogger(AUDIT_LOGGER_NAME)
logger = logging.getLogger(__name__)


def log(action: Action | str, **fields: Any) -> None:
    """Emit one audit event."""
    try:
        document = build_document(action, **fields)
    except Exception:  # pylint: disable=broad-exception-caught
        logger.exception("Audit event %r could not be built", action)
        return

    audit_logger.log(
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


@functools.cache
def service_version() -> str | None:
    """Return the release of the backend."""
    return getattr(settings, "RELEASE", None)


@functools.cache
def service_node_name() -> str:
    """Return the name of the node serving, its pod name on Kubernetes."""
    return socket.gethostname()


def build_document(  # noqa: PLR0913  # pylint: disable=too-many-arguments,too-many-locals
    action: Action | str,
    *,
    request: Any = None,
    outcome: Outcome | str = Outcome.SUCCESS,
    reason: Reason | str | None = None,
    category: EventCategory | str | Iterable[EventCategory | str] | None = None,
    types: list[EventType | str] | None = None,
    target: Any = None,
    actor: Any = FROM_REQUEST,
    actor_type: ActorType | str | None = None,
    auth_method: str | None = None,
    client_id: str | None = None,
    target_service: str | None = None,
    status_code: int | None = None,
    error: Any = None,
    error_type: str | None = None,
    message: str | None = None,
    **details: Any,
) -> dict[str, Any]:
    """Return the ECS document of an event, pruned of empty fields.

    ``action`` is what was attempted: an ``Action``, whose category and types
    apply unless given here, or a bare dotted name (``room.create``).
    ``category`` may be a list, for an event filed under several.
    The actor, auth method and network fields are read from ``request``, by
    default from the context of the request being served.
    ``actor``, ``actor_type``, ``auth_method`` and ``client_id`` override them;
    ``actor=None`` records no account even when the request is signed in.
    ``target`` is the resource acted on, reported as ``entity.target``.
    ``target_service`` names the peer service the backend called, reported as
    ``service.target.name``. Any other keyword argument lands under
    ``lasuite.details``, unless ``None`` or an empty mapping. The value of a
    detail is data and is kept whole: a ``None`` or an empty mapping inside
    it, as in the ``from`` and ``to`` of a change, stays.
    """
    context = (
        request_context() if request is None else RequestContext.from_request(request)
    )
    outcome = Outcome(outcome)
    reason = Reason(reason) if reason is not None else None
    if isinstance(action, Action):
        category = category or action.category
        types = types or list(action.types)
    actor_fields = describe_actor(
        context.request,
        actor=actor,
        actor_type=actor_type,
        client_id=client_id,
        auth_method=auth_method,
    )
    stream = stream_fields()

    document = prune_empty(
        {
            "@timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "ecs": {"version": ECS_VERSION},
            "data_stream": stream["data_stream"],
            "message": message,
            "service": {
                "name": settings.AUDIT_LOG_SERVICE_NAME,
                "environment": getattr(settings, "ENVIRONMENT", None),
                "version": service_version(),
                "node": {"name": service_node_name()},
                "origin": {"name": actor_fields["service"]},
                "target": {"name": target_service},
            },
            "event": _event_fields(action, outcome, reason, category, types)
            | stream["event"],
            "client": {"ip": context.client_ip},
            "source": {"ip": context.client_ip},
            "http": {
                "request": {"id": context.request_id, "method": context.method},
                "response": {"status_code": status_code},
            },
            "url": {"path": context.path},
            "user_agent": {"original": context.user_agent},
            "user": actor_fields["user"],
            "organization": actor_fields["organization"],
            "entity": {
                "target": describe_target(target) if target is not None else None
            },
            "lasuite": {
                **actor_fields["lasuite"],
                "outcome": str(outcome),
            },
            "error": {
                "message": str(error) if error is not None else None,
                "type": error_type,
            },
        }
    )
    # Pruned apart and one level deep only: what a detail holds is data
    if details := prune_empty(render_value(details), depth=1):
        document["lasuite"]["details"] = details
    return document


# The allowed kwargs of  the``log`` function that fill an event field
EVENT_FIELDS = frozenset(
    name
    for name, parameter in inspect.signature(build_document).parameters.items()
    if parameter.kind is inspect.Parameter.KEYWORD_ONLY
)


def _categories(category) -> list[EventCategory]:
    if category is None:
        return [DEFAULT_CATEGORY]
    if isinstance(category, str):
        return [EventCategory(category)]
    return list(dict.fromkeys(EventCategory(item) for item in category)) or [
        DEFAULT_CATEGORY
    ]


def _event_fields(action, outcome, reason, category, types) -> dict[str, Any]:
    """Return the ECS ``event`` fields of the event."""
    categories = _categories(category)
    type_list = [EventType(item) for item in (types or [])]
    if not type_list:
        type_list = [_default_type(outcome, categories)]
    if (
        outcome == Outcome.DENIED
        and EventType.DENIED not in type_list
        and is_expected(categories, EventType.DENIED)
    ):
        type_list.append(EventType.DENIED)
    try:
        check_classification(categories, type_list)
    except ValueError:
        logger.exception("Audit event %r is misclassified", str(action))

    return {
        "kind": "event",
        "id": str(uuid.uuid4()),
        "action": str(action),
        "category": [str(item) for item in categories],
        "type": [str(item) for item in type_list],
        "outcome": str(Outcome.FAILURE if outcome == Outcome.DENIED else outcome),
        "reason": str(reason) if reason is not None else None,
    }


def _default_type(outcome: Outcome, categories: list[EventCategory]) -> EventType:
    """Return the type of an event whose action names none.

    ``denied`` or ``error`` when one of the categories expects it, else ``info``.
    """
    preferred = {Outcome.DENIED: EventType.DENIED, Outcome.FAILURE: EventType.ERROR}
    event_type = preferred.get(outcome)
    if event_type is not None and is_expected(categories, event_type):
        return event_type
    return EventType.INFO
