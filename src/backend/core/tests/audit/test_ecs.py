"""Tests holding audit events to the Elastic Common Schema 9.5.0."""

from django.apps import apps

import pytest

from core import audit, auditing
from core.audit import ecs
from core.audit.admin import ADMIN_ACCESS_ACTION, AdminVerb, category_for, types_for


def declared_actions() -> list[audit.Action]:
    """Return every action the project and the facility declare."""
    actions = [
        value for value in vars(auditing).values() if isinstance(value, audit.Action)
    ]
    return [*actions, audit.LOGIN_ACTION, audit.LOGOUT_ACTION, ADMIN_ACCESS_ACTION]


def test_check_classification_accepts_expected_types():
    """A type is valid when one of the categories expects it."""
    ecs.check_classification([audit.EventCategory.IAM], [audit.EventType.USER])
    ecs.check_classification(
        [audit.EventCategory.API, audit.EventCategory.AUTHENTICATION],
        [audit.EventType.CREATION, audit.EventType.DENIED],
    )


def test_check_classification_refuses_unexpected_types():
    """ECS expects no ``denied`` for an authentication, nor ``end`` on the web."""
    with pytest.raises(ValueError, match="denied"):
        ecs.check_classification(
            [audit.EventCategory.AUTHENTICATION], [audit.EventType.DENIED]
        )
    with pytest.raises(ValueError, match="end"):
        ecs.check_classification([audit.EventCategory.WEB], [audit.EventType.END])


def test_every_category_has_its_expected_types():
    """The subset of categories the facility uses is fully transcribed."""
    assert set(ecs.EXPECTED_EVENT_TYPES) == set(audit.EventCategory)


@pytest.mark.parametrize("action", declared_actions(), ids=str)
def test_declared_actions_are_classified_as_ecs_expects(action):
    """Every action of the catalogue is classified as ECS expects.

    ``Action`` refuses anything else when it is declared: this lists them.
    """
    ecs.check_classification([action.category or ecs.DEFAULT_CATEGORY], action.types)


@pytest.mark.parametrize("verb", list(AdminVerb))
def test_admin_writes_are_classified_as_ecs_expects(verb):
    """Writes made through the admin are classified as ECS expects, for any model."""
    for model in apps.get_models():
        ecs.check_classification([category_for(model)], types_for(model, verb))
