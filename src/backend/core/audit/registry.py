"""Declare what audit events may say about models and authentication classes.

The project registers them from an ``auditing`` module in one of its apps,
imported once the audit app is ready::

    audit.register(
        Room,
        fields=("slug", "access_level"),  # describe the target
        admin_values=("name", "access_level"),  # values diffed in the admin
        category=audit.EventCategory.CONFIGURATION,  # ECS category of admin writes
    )
    audit.register(Application, entity_type="application")  # ECS ``entity.type``
    audit.register(ResourceAccess, user_target="user")  # the account it is about
    audit.register_auth_method(ApplicationJWTAuthentication, "application_jwt")

A target is always identified by its model name and primary key, so a model
that is not registered is still identifiable, just less detailed.
"""

from dataclasses import dataclass

from django.db.models import Model

from .ecs import ENTITY_TYPES
from .enums import EventCategory


class AlreadyRegistered(Exception):
    """A model or an authentication class that was registered twice."""


@dataclass(frozen=True)
class ModelOptions:
    """What audit events may say about a model.

    ``fields`` describe the model when it is the target of an event, under
    ``entity.target``. ``admin_values`` are the fields whose before and after
    values may be recorded when they change in the Django admin. ``category``
    is the ECS category of admin writes: ``iam`` for anything granting access
    to the product, ``configuration`` by default. ``entity_type`` is the ECS
    ``entity.type`` of the model, when one of its allowed values fits.
    ``user_target`` names the attribute holding the account an event on the
    model is about, reported as ``user.target``.
    """

    fields: tuple[str, ...] = ()
    admin_values: tuple[str, ...] = ()
    category: EventCategory | None = None
    entity_type: str | None = None
    user_target: str | None = None


_models: dict[type[Model], ModelOptions] = {}
_auth_methods: dict[str, str] = {}


def register(  # noqa: PLR0913  # pylint: disable=too-many-arguments
    model: type[Model],
    *,
    fields=(),
    admin_values=(),
    category: EventCategory | str | None = None,
    entity_type: str | None = None,
    user_target: str | None = None,
) -> None:
    """Declare what audit events may say about ``model``."""
    if model in _models:
        raise AlreadyRegistered(f"{model._meta.label} is already registered")  # noqa: SLF001
    if entity_type is not None and entity_type not in ENTITY_TYPES:
        raise ValueError(
            f"{entity_type!r} is not an ECS entity type: "
            f"use one of {', '.join(sorted(ENTITY_TYPES))}"
        )
    _models[model] = ModelOptions(
        fields=tuple(fields),
        admin_values=tuple(admin_values),
        category=EventCategory(category) if category is not None else None,
        entity_type=entity_type,
        user_target=user_target,
    )


def unregister(model: type[Model]) -> ModelOptions | None:
    """Forget ``model`` and return what was registered for it, if anything."""
    return _models.pop(model, None)


def model_options(model: type[Model]) -> ModelOptions:
    """Return what is registered for a model, or for its concrete model."""
    for klass in (model, model._meta.concrete_model):  # noqa: SLF001
        if (options := _models.get(klass)) is not None:
            return options
    return ModelOptions()


def dotted_path(klass: type) -> str:
    """Return the dotted path Django and DRF name a class by."""
    return f"{klass.__module__}.{klass.__qualname__}"


def register_auth_method(klass: type, name: str) -> None:
    """Name the ``lasuite.auth.method`` of a DRF authentication class or a login backend.

    A DRF class is also the default of its subclasses. A login backend must be
    registered itself: custom backends often subclass ``ModelBackend`` only for
    its permission checks, and must not pass for password logins.
    """
    path = dotted_path(klass)
    if path in _auth_methods:
        raise AlreadyRegistered(f"{path} is already registered")
    _auth_methods[path] = name


def auth_methods() -> dict[str, str]:
    """Return the registered auth methods, keyed by dotted path."""
    return dict(_auth_methods)
