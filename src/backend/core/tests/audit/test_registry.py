"""Tests for the registry of audited models and authentication classes."""

from types import SimpleNamespace

import pytest

from core import audit
from core.audit.actor import auth_method_for, auth_method_for_backend
from core.audit.registry import (
    ModelOptions,
    auth_methods,
    dotted_path,
    model_options,
    unregister,
)
from core.audit.testing import override_registration
from core.external_api.authentication import ApplicationJWTAuthentication
from core.models import Resource, Room


def test_register_twice_is_refused():
    """A model is registered once, like in the admin."""
    audit.register(Resource, fields=("id",))
    try:
        with pytest.raises(audit.AlreadyRegistered):
            audit.register(Resource)
    finally:
        unregister(Resource)


def test_register_refuses_unknown_options():
    """A misspelled option is an error, not silently ignored."""
    with pytest.raises(TypeError):
        audit.register(Resource, field=("name",))  # pylint: disable=unexpected-keyword-arg

    assert model_options(Resource) == ModelOptions()


def test_model_options_falls_back_to_the_concrete_model():
    """A proxy model is described as the model it proxies."""
    proxy = type("ProxyRoom", (), {"_meta": SimpleNamespace(concrete_model=Room)})

    with override_registration(Room, fields=("slug",)):
        assert model_options(proxy).fields == ("slug",)


def test_override_registration_restores_the_previous_one():
    """The test helper puts back what the project registered."""
    registered = model_options(Room)

    with override_registration(Room, fields=("slug",)):
        assert model_options(Room).fields == ("slug",)

    assert model_options(Room) == registered


def test_project_declarations_are_discovered():
    """``core.auditing`` is imported when the audit app is ready."""
    assert model_options(Room).fields == ("slug", "name", "access_level")
    assert auth_methods()[dotted_path(ApplicationJWTAuthentication)] == (
        "application_jwt"
    )
    assert (
        auth_method_for_backend(
            "core.authentication.backends.OIDCAuthenticationBackend"
        )
        == "oidc"
    )


def test_register_auth_method_twice_is_refused():
    """An authentication class is named once."""
    with pytest.raises(audit.AlreadyRegistered):
        audit.register_auth_method(ApplicationJWTAuthentication, "other")


def test_auth_method_is_inherited_by_subclasses():
    """A DRF class takes the name of its closest registered base."""

    class CustomAuthentication(ApplicationJWTAuthentication):
        """A project subclass nobody registered."""

    authenticator = object.__new__(CustomAuthentication)

    assert auth_method_for(authenticator) == "application_jwt"
