"""Tests holding audit events to the Elastic Common Schema 9.5.0."""

from collections.abc import Iterator, Mapping
from typing import Any

from django.apps import apps
from django.test import RequestFactory

import pytest

from core import audit, auditing
from core.audit import ecs
from core.audit.admin import ADMIN_ACCESS_ACTION, AdminVerb, category_for, types_for
from core.factories import ApplicationFactory, RoomFactory, UserFactory
from core.recording.event.authentication import MachineUser

pytestmark = pytest.mark.django_db

# The ECS 9.5.0 fields audit events may carry, from
# https://github.com/elastic/ecs/blob/v9.5.0/generated/ecs/ecs_flat.yml
ECS_FIELDS = frozenset(
    {
        "@timestamp",
        "client.ip",
        "data_stream.dataset",
        "data_stream.namespace",
        "data_stream.type",
        "ecs.version",
        "entity.target.id",
        "entity.target.name",
        "entity.target.sub_type",
        "entity.target.type",
        "error.message",
        "error.stack_trace",
        "error.type",
        "event.action",
        "event.category",
        "event.dataset",
        "event.id",
        "event.kind",
        "event.outcome",
        "event.reason",
        "event.type",
        "http.request.id",
        "http.request.method",
        "http.response.status_code",
        "log.level",
        "log.logger",
        "message",
        "organization.id",
        "service.environment",
        "service.name",
        "service.node.name",
        "service.origin.name",
        "service.target.name",
        "service.version",
        "source.ip",
        "url.path",
        "user.domain",
        "user.id",
        "user.roles",
        "user.target.domain",
        "user.target.id",
        "user_agent.original",
    }
)
# What is not ECS lives in these namespaces: ``raw`` holds a target's own fields
CUSTOM_NAMESPACES = ("lasuite.", "entity.target.raw.")


def leaf_paths(document: Mapping[str, Any], prefix: str = "") -> Iterator[str]:
    """Yield the dotted path of every value of a document."""
    for key, value in document.items():
        path = f"{prefix}{key}"
        if isinstance(value, Mapping):
            yield from leaf_paths(value, f"{path}.")
        else:
            yield path


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


def _documents(audit_events) -> list[dict[str, Any]]:
    """Emit the events covering every field the facility fills."""
    user = UserFactory(is_staff=True)
    request = RequestFactory().post(
        "/external-api/v1.0/rooms/",
        REMOTE_ADDR="1.2.3.4",
        HTTP_USER_AGENT="Mozilla/5.0",
    )
    request.user = user
    request.auth = {"client_id": "app-1"}

    audit.log(
        auditing.ROOM_UPDATE,
        request=request,
        target=RoomFactory(),
        status_code=500,
        outcome=audit.Outcome.FAILURE,
        reason=audit.Reason.INTERNAL_ERROR,
        error="boom",
        error_type="builtins.RuntimeError",
        message="anything",
        updated_fields=["name"],
    )
    audit.log(auditing.USER_PROVISION, target=user)
    audit.log(auditing.APPLICATION_TOKEN_ISSUE, target=ApplicationFactory())
    audit.log(
        auditing.RECORDING_TRANSCRIPT_REQUEST,
        actor=MachineUser("livekit"),
        target_service="summary",
    )
    return audit_events


def test_documents_only_carry_ecs_fields_or_custom_namespaces(audit_events):
    """No field outside ECS 9.5.0 lands anywhere but in a custom namespace."""
    for document in _documents(audit_events):
        stray = {
            path
            for path in leaf_paths(document)
            if path not in ECS_FIELDS and not path.startswith(CUSTOM_NAMESPACES)
        }

        assert not stray, f"{document['event']['action']}: {sorted(stray)}"
