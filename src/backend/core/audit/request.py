"""Read the network fields and the request id behind an audit event."""

import uuid
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Any

from django.conf import settings

from dockerflow.logging import request_id_context
from rest_framework.throttling import BaseThrottle

USER_AGENT_MAX_LENGTH = 1024


def current_request_id() -> str | None:
    """Return the id of the request being served, if any."""
    return request_id_context.get(None)


def resolve_client_ip(request) -> str | None:
    """Return the address of the real client, never the one of a proxy.

    It reuses DRF's throttles to identify the client.
    """
    return BaseThrottle().get_ident(request) or request.META.get("REMOTE_ADDR")


@dataclass(frozen=True)
class RequestContext:
    """What an audit event reads from the request behind it.

    The network fields are read once, when the request comes in. The request
    itself is kept for the actor, only known once it is authenticated: it is
    the Django request, onto which DRF copies its user and auth, but not its
    authenticator, so the auth method of a DRF view is not known from it.
    Outside a request, every field is ``None``.
    """

    request: Any = None
    request_id: str | None = None
    method: str | None = None
    path: str | None = None
    client_ip: str | None = None
    user_agent: str | None = None

    @classmethod
    def from_request(cls, request) -> "RequestContext":
        """Read the context of ``request``, its user agent cut where ECS stops."""
        meta = getattr(request, "META", None) or {}
        return cls(
            request=request,
            request_id=current_request_id(),
            method=getattr(request, "method", None),
            path=getattr(request, "path", None) or None,
            client_ip=resolve_client_ip(request),
            user_agent=meta.get("HTTP_USER_AGENT", "")[:USER_AGENT_MAX_LENGTH] or None,
        )


_request_context: ContextVar[RequestContext | None] = ContextVar(
    "audit_request_context", default=None
)


def request_context() -> RequestContext:
    """Return the context of the request being served, as set by ``AuditLogMiddleware``.

    It is empty outside a request.
    """
    return _request_context.get() or RequestContext()


def set_request_context(context: RequestContext) -> Token:
    """Make ``context`` the one of the request being served, until reset."""
    return _request_context.set(context)


def reset_request_context(token: Token) -> None:
    """Restore the context that was current before ``set_request_context``."""
    _request_context.reset(token)


class AuditLogMiddleware:
    """Settle the request id and the request context, then echo the id.

    It must come right after ``DockerflowMiddleware``, which sets the id from
    the inbound ``DOCKERFLOW_REQUEST_ID_HEADER_NAME`` header. Unless
    ``REQUEST_ID_TRUST_HEADER`` says the ingress overwrites that header, the id
    is replaced by a fresh one before anything logs, so that a client, the web
    server access log and the audit events of a request can be joined on an id
    the client did not choose.

    The context of the request is kept while it is served, so that an audit
    event emitted far from the view, as from a service, still reads its actor
    and network fields from it.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not settings.REQUEST_ID_TRUST_HEADER:
            request_id_context.set(str(uuid.uuid4()))

        token = set_request_context(RequestContext.from_request(request))
        try:
            response = self.get_response(request)
        finally:
            reset_request_context(token)
        header = settings.DOCKERFLOW_REQUEST_ID_HEADER_NAME
        if not response.has_header(header):
            response[header] = current_request_id()
        return response
