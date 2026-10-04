"""Audit Django's authentication signals: login, failed login, logout."""

from django.contrib.auth import BACKEND_SESSION_KEY
from django.contrib.auth.signals import (
    user_logged_in,
    user_logged_out,
    user_login_failed,
)

from .actions import Action
from .actor import AUTH_METHOD_UNKNOWN, auth_method_for_backend
from .emitter import log
from .enums import ActorType, EventCategory, EventType, Outcome, Reason

LOGIN_ACTION = Action(
    "user.login", category=EventCategory.AUTHENTICATION, types=(EventType.START,)
)
LOGOUT_ACTION = Action(
    "user.logout", category=EventCategory.AUTHENTICATION, types=(EventType.END,)
)


def get_login_backend(request, user) -> str | None:
    """Return the dotted path of the backend a login went through."""
    session = getattr(request, "session", None)
    from_session = session.get(BACKEND_SESSION_KEY) if session is not None else None
    return from_session or getattr(user, "backend", None)


def auth_method_from_credentials(credentials) -> str:
    """Name the mechanism of a failed login from the credentials it submitted."""
    if "password" in credentials:
        return "password"
    if "nonce" in credentials:
        return "oidc"
    return AUTH_METHOD_UNKNOWN


def on_user_logged_in(sender, request, user, **kwargs):  # pylint: disable=unused-argument
    """Record a successful login."""
    backend = get_login_backend(request, user)
    log(
        LOGIN_ACTION,
        request=request,
        actor=user,
        auth_method=auth_method_for_backend(backend),
        auth_backend=backend,
    )


def on_user_login_failed(sender, credentials, request, **kwargs):  # pylint: disable=unused-argument
    """Record a failed login.

    It is a refusal, like a 401 on the API, whether the credentials were
    rejected or a backend raised ``PermissionDenied``. Its actor is anonymous
    even without a request, as when ``authenticate`` is called without one.
    """
    log(
        LOGIN_ACTION,
        outcome=Outcome.DENIED,
        reason=Reason.AUTHENTICATION_FAILED,
        request=request,
        actor_type=ActorType.ANONYMOUS,
        auth_method=auth_method_from_credentials(credentials),
    )


def on_user_logged_out(sender, request, user, **kwargs):  # pylint: disable=unused-argument
    """Record a logout, unless no one was signed in."""
    if user is None:
        return
    log(
        LOGOUT_ACTION,
        request=request,
        actor=user,
    )


def connect_auth_signals() -> None:
    """Connect the receivers to authentication signal."""
    user_logged_in.connect(on_user_logged_in, dispatch_uid="audit.user_logged_in")
    user_login_failed.connect(
        on_user_login_failed, dispatch_uid="audit.user_login_failed"
    )
    user_logged_out.connect(on_user_logged_out, dispatch_uid="audit.user_logged_out")
