"""Resolve who is acting: actor type, identifiers, auth method and tenant.

Personal data is kept to a minimum on purpose: a person is identified by its
primary key, its OIDC ``sub`` when it has one and the domain of its email
address. The address itself is never recorded.
"""

from collections.abc import Mapping
from enum import Enum
from typing import Any

from django.contrib.auth import get_user_model

from lasuite.tools.email import get_domain_from_email

from .enums import ActorType
from .registry import auth_methods, dotted_path

AUTH_METHOD_NONE = "none"
AUTH_METHOD_SESSION = "session"
AUTH_METHOD_UNKNOWN = "unknown"

USER_ROLE_FLAGS = (("is_superuser", "superuser"), ("is_staff", "staff"))


class _ActorDefault(Enum):
    """Sentinel telling an omitted ``actor`` apart from ``None``(no account)."""

    FROM_REQUEST = "from_request"


FROM_REQUEST = _ActorDefault.FROM_REQUEST

DEFAULT_AUTH_METHODS = {
    "rest_framework.authentication.SessionAuthentication": AUTH_METHOD_SESSION,
    "rest_framework.authentication.BasicAuthentication": "basic",
    "rest_framework.authentication.TokenAuthentication": "token",
    "django.contrib.auth.backends.ModelBackend": "password",
}


def _auth_methods() -> dict[str, str]:
    return {**DEFAULT_AUTH_METHODS, **auth_methods()}


def auth_method_for(authenticator) -> str:
    """Return the auth method name for a DRF authenticator instance."""
    if authenticator is None:
        return AUTH_METHOD_NONE
    methods = _auth_methods()
    for klass in type(authenticator).__mro__:
        name = methods.get(dotted_path(klass))
        if name:
            return name
    return AUTH_METHOD_UNKNOWN


def auth_method_for_backend(backend: str | None) -> str:
    """Return the auth method name for the dotted path of a login backend."""
    return _auth_methods().get(backend or "", AUTH_METHOD_UNKNOWN)


def request_auth_method(request) -> str:
    """Return how ``request`` was authenticated.

    A DRF request names its authenticator. A plain Django request, as served
    by the admin or the logout view, can only be authenticated by its session.
    """
    if hasattr(request, "successful_authenticator"):
        return auth_method_for(request.successful_authenticator)
    if _is_authenticated(getattr(request, "user", None)):
        return AUTH_METHOD_SESSION
    return AUTH_METHOD_NONE


def email_domain(email) -> str | None:
    """Return the lower-cased domain part of an email address, if any.

    It is parsed as for ``Application.can_delegate_email``, so an audited
    domain is the one a delegation was checked against.
    """
    domain = get_domain_from_email(str(email)) if email else None
    return domain.lower() if domain else None


def client_id_from_auth(auth) -> str | None:
    """Extract an application client id from a token payload."""
    if isinstance(auth, Mapping):
        value = auth.get("client_id")
        return str(value) if value else None
    return None


def _is_authenticated(user) -> bool:
    return bool(user is not None and getattr(user, "is_authenticated", False))


def _is_account(user) -> bool:
    """Tell whether ``user`` is a user account.

    It stays one once deleted, when Django clears its primary key.
    """
    return isinstance(user, get_user_model())


def _is_service(user) -> bool:
    """Tell whether ``user`` authenticated without an account, as a machine user."""
    return _is_authenticated(user) and not _is_account(user)


def _default_actor_type(request, user, client_id) -> ActorType:
    if client_id:
        return ActorType.APPLICATION
    if request is None and user is None:
        return ActorType.SYSTEM
    if _is_service(user):
        return ActorType.SERVICE
    if _is_account(user):
        return ActorType.USER
    return ActorType.ANONYMOUS


def describe_user(user) -> dict[str, Any]:
    """Return the ECS fields identifying a person: id and email domain.

    The id is missing for accounts that were deleted.
    """
    return {
        "id": str(user.pk) if user.pk is not None else None,
        "domain": email_domain(getattr(user, "email", None)),
    }


def user_sub(user) -> str | None:
    """Return the OIDC sub of an account, missing for one that never signed in."""
    return getattr(user, "sub", None) or None


def user_roles(user) -> list[str] | None:
    """Return the privileges of an account at the time of the event, if any."""
    roles = [role for flag, role in USER_ROLE_FLAGS if getattr(user, flag, False)]
    return roles or None


def describe_actor(
    request,
    *,
    actor: Any = FROM_REQUEST,
    actor_type: ActorType | str | None = None,
    client_id: str | None = None,
    auth_method: str | None = None,
) -> dict[str, Any]:
    """Return the fields describing the actor.

    That is the ECS ``user`` and ``organization`` fields, the name of the
    service acting, if any, reported as ``service.origin.name``, and the
    ``lasuite`` ones. Everything is read from ``request`` unless overridden.
    ``actor=None`` means no account, whoever the request is signed in as:
    an explicit ``actor_type`` alone does not discard it.
    Without a request or an actor, the actor is the system. ``user`` is the
    account whose authority the action used, see ``ActorType``: None for a
    service, the system or an anonymous caller.
    """
    user = getattr(request, "user", None) if actor is FROM_REQUEST else actor
    client_id = client_id or client_id_from_auth(getattr(request, "auth", None))
    actor_type = actor_type or _default_actor_type(request, user, client_id)
    is_account = _is_account(user)

    lasuite: dict[str, Any] = {
        "actor": {
            "type": str(ActorType(actor_type)),
            "sub": user_sub(user) if is_account else None,
        },
        "auth": {"method": auth_method or request_auth_method(request)},
        "application": {"client_id": client_id},
    }
    tenant = client_id or (
        email_domain(getattr(user, "email", None)) if is_account else None
    )
    return {
        "user": (
            {**describe_user(user), "roles": user_roles(user)} if is_account else None
        ),
        "organization": {"id": tenant},
        "service": user.get_username() if _is_service(user) else None,
        "lasuite": lasuite,
    }
