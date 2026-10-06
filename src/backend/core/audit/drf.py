"""Django REST framework integration

``AuditViewMixin`` turns every response of an audited action into one audit
event, from DRF's ``finalize_response`` hook, which runs for successes and for
handled errors alike. An exception DRF does not handle is audited as an
internal error from ``handle_exception`` before it propagates.

The CRUD actions a viewset audits are mapped in ``audit_actions``.
Extra action names require a decorator::

    class RoomViewSet(audit.AuditViewMixin, viewsets.ModelViewSet):
        audit_actions = {"create": ROOM_CREATE, "retrieve": ROOM_RETRIEVE}

        @action(detail=True, methods=["post"], audit_action=ROOM_INVITE)
        def invite(self, request, pk=None): ...

A refusal is recorded under the action that was attempted, with its outcome
and reason derived from the response status.
"""

import copy
import logging
from collections.abc import Mapping
from typing import Any

from .actions import Action
from .emitter import EVENT_FIELDS, log
from .enums import EventCategory, EventType, Outcome, Reason
from .utils import exception_type

ACTION_TYPES = {
    "create": EventType.CREATION,
    "update": EventType.CHANGE,
    "partial_update": EventType.CHANGE,
    "destroy": EventType.DELETION,
    "retrieve": EventType.ACCESS,
    "list": EventType.ACCESS,
}
STATUS_REASONS = {
    400: Reason.VALIDATION_ERROR,
    401: Reason.AUTHENTICATION_FAILED,
    403: Reason.PERMISSION_DENIED,
    404: Reason.NOT_FOUND,
    409: Reason.CONFLICT,
    429: Reason.RATE_LIMITED,
}
DENIED_STATUSES = frozenset({401, 403, 429})

_logger = logging.getLogger(__name__)


def error_message(response) -> Any:
    """Return the message of an error response, as DRF or the view wrote it."""
    data = getattr(response, "data", None)
    if isinstance(data, Mapping):
        return data.get("detail") or data.get("error")
    return None


class AuditViewMixin:
    """Emit one audit event per response of an audited action.

    ``audit_actions`` maps the CRUD actions only. An extra action is audited
    by passing ``audit_action`` to its ``@action`` decorator.

    While handling a request, a view may *assign* ``audit_target``,
    ``audit_actor`` and ``audit_details``; ``check_object_permissions`` sets
    the target on its own, before a refusal can happen. A detail named after
    an event field, as ``outcome`` or ``request``, is dropped: overriding one
    is done in ``get_audit_fields``.
    """

    audit_actions: Mapping[str, Action | str] = {}
    # Only declared so the router may pass the ``@action`` keyword arguments
    # to ``as_view``; the action is read from the handler of the request.
    audit_action: Action | str | None = None
    audit_target: Any = None
    audit_actor: Any = None
    audit_details: Mapping[str, Any] | None = None

    def __init_subclass__(cls, **kwargs):
        """Refuse extra actions in ``audit_actions``, keyed by a method name."""
        super().__init_subclass__(**kwargs)
        if extra := sorted(set(cls.audit_actions) - set(ACTION_TYPES)):
            raise TypeError(
                f"{cls.__qualname__}.audit_actions only maps CRUD actions: "
                f"audit {', '.join(extra)} with @action(audit_action=...)"
            )

    def check_object_permissions(self, request, obj):
        """Remember the object as the target."""
        self.audit_target = obj
        super().check_object_permissions(request, obj)

    def perform_destroy(self, instance):
        """Keep a copy of the target, since deleting an instance clears its pk."""
        self.audit_target = copy.copy(instance)
        super().perform_destroy(instance)

    def finalize_response(self, request, response, *args, **kwargs):
        """Audit the response once DRF has built it."""
        response = super().finalize_response(request, response, *args, **kwargs)
        self.emit_audit_event(request, response.status_code, error_message(response))
        return response

    def handle_exception(self, exc):
        """Audit an exception DRF cannot turn into a response, then let it propagate.

        Only its class is recorded since its message could carry personal data.
        """
        try:
            return super().handle_exception(exc)
        except Exception as error:
            self.emit_audit_event(self.request, 500, error_type=exception_type(error))
            raise

    def get_audit_action(self) -> Action | str | None:
        """Return what the current request audits, if anything.

        An extra action is read from its handler, so a request that reaches
        none, as an OPTIONS request or a refused method, audits nothing.
        """
        name = getattr(self, "action", None)
        if name in ACTION_TYPES:
            return self.audit_actions.get(name)
        handler = getattr(self, name, None) if name else None
        return getattr(handler, "kwargs", {}).get("audit_action")

    def emit_audit_event(self, request, status_code, error=None, error_type=None):
        """Emit the event of the current action, if it is audited.

        Never raises: a response must not fail because it could not be audited.
        """
        try:
            action = self.get_audit_action()
            if action is not None:
                fields = self.get_audit_fields(status_code, error)
                log(action, request=request, error_type=error_type, **fields)
        except Exception:  # pylint: disable=broad-exception-caught
            _logger.exception("Audit event of %s could not be emitted", request.path)

    def get_audit_fields(self, status_code, error=None) -> dict[str, Any]:
        """Return the fields of the event for a response of ``status_code``.

        The category and types of the ``Action`` win over those derived from
        the DRF action.
        """
        action = self.get_audit_action()
        category, types = None, []
        if isinstance(action, Action):
            category, types = action.category, list(action.types)
        details = {
            key: value
            for key, value in (self.audit_details or {}).items()
            if key not in EVENT_FIELDS
        }
        fields = {
            **details,
            "category": category or EventCategory.API,
            "types": types
            or [ACTION_TYPES.get(getattr(self, "action", None), EventType.INFO)],
            "target": self.audit_target,
            "actor": self.audit_actor,
        }
        if status_code >= 400:
            fields |= {
                "outcome": (
                    Outcome.DENIED
                    if status_code in DENIED_STATUSES
                    else Outcome.FAILURE
                ),
                "reason": STATUS_REASONS.get(
                    status_code, Reason.INTERNAL_ERROR if status_code >= 500 else None
                ),
                "status_code": status_code,
                "error": error,
            }
        if status_code == 401:
            fields["category"] = EventCategory.AUTHENTICATION
        return fields
