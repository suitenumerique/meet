"""Structured audit logging."""

from .actions import Action
from .actor import email_domain
from .drf import AuditViewMixin
from .emitter import AUDIT_LOGGER_NAME, log
from .enums import ActorType, EventCategory, EventType, Outcome, Reason
from .formatter import AuditJsonFormatter
from .registry import AlreadyRegistered, register, register_auth_method
from .request import request_context
from .signals import LOGIN_ACTION, LOGOUT_ACTION, connect_auth_signals
from .utils import exception_type

__all__ = [
    "AUDIT_LOGGER_NAME",
    "LOGIN_ACTION",
    "LOGOUT_ACTION",
    "Action",
    "ActorType",
    "AlreadyRegistered",
    "AuditJsonFormatter",
    "AuditViewMixin",
    "EventCategory",
    "EventType",
    "Outcome",
    "Reason",
    "connect_auth_signals",
    "email_domain",
    "exception_type",
    "log",
    "register",
    "register_auth_method",
    "request_context",
]
