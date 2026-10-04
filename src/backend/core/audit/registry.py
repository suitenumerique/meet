"""Declare what audit events may say about models and authentication classes.

The project registers them from an ``auditing`` module in one of its apps,
imported once the audit app is ready::

    audit.register(Room, fields=("slug", "access_level"))  # describe the target
    audit.register_auth_method(ApplicationJWTAuthentication, "application_jwt")

A target is always identified by its model name and primary key, so a model
that is not registered is still identifiable, just less detailed.
"""

from dataclasses import dataclass

from django.db.models import Model


class AlreadyRegistered(Exception):
    """A model or an authentication class that was registered twice."""


@dataclass(frozen=True)
class ModelOptions:
    """What audit events may say about a model.

    ``fields`` describe the model when it is the target of an event.
    """

    fields: tuple[str, ...] = ()


_models: dict[type[Model], ModelOptions] = {}
_auth_methods: dict[str, str] = {}


def register(model: type[Model], *, fields=()) -> None:
    """Declare what audit events may say about ``model``."""
    if model in _models:
        raise AlreadyRegistered(f"{model._meta.label} is already registered")  # noqa: SLF001
    _models[model] = ModelOptions(fields=tuple(fields))


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
