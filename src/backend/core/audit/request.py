"""Read the network fields and the request id behind an audit event."""

import uuid
from contextvars import ContextVar, Token

from django.conf import settings

from dockerflow.logging import request_id_context
from rest_framework.throttling import BaseThrottle

_current_request: ContextVar = ContextVar("audit_request", default=None)


def current_request():
    """Return the request being served, if any, as set by ``AuditLogMiddleware``.

    It is the Django request: DRF copies its user and auth onto it, but not its
    authenticator, so the auth method of a DRF view is not known from it.
    """
    return _current_request.get()


def set_current_request(request) -> Token:
    """Make ``request`` the request being served, until the token is reset."""
    return _current_request.set(request)


def reset_current_request(token: Token) -> None:
    """Restore the request that was current before ``set_current_request``."""
    _current_request.reset(token)


def current_request_id() -> str | None:
    """Return the id of the request being served, if any."""
    return request_id_context.get(None)


def resolve_client_ip(request) -> str | None:
    """Return the address of the real client, never the one of a proxy.

    It reuses DRF's throttles to identify the client.
    """
    return BaseThrottle().get_ident(request) or request.META.get("REMOTE_ADDR")


class AuditLogMiddleware:
    """Settle the request id and the current request, then echo the id.

    It must come right after ``DockerflowMiddleware``, which sets the id from
    the inbound ``DOCKERFLOW_REQUEST_ID_HEADER_NAME`` header. Unless
    ``REQUEST_ID_TRUST_HEADER`` says the ingress overwrites that header, the id
    is replaced by a fresh one before anything logs, so that a client, the web
    server access log and the audit events of a request can be joined on an id
    the client did not choose.

    The request is kept as the current one while it is served, so that an
    audit event emitted far from the view, as from a service, still reads its
    actor and network fields from it.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not settings.REQUEST_ID_TRUST_HEADER:
            request_id_context.set(str(uuid.uuid4()))

        token = set_current_request(request)
        try:
            response = self.get_response(request)
        finally:
            reset_current_request(token)
        header = settings.DOCKERFLOW_REQUEST_ID_HEADER_NAME
        if not response.has_header(header):
            response[header] = current_request_id()
        return response
