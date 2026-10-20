"""Tests for building and emitting audit events."""

import json
import logging
import sys
import uuid
from datetime import datetime
from unittest import mock

from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

import pytest
from dockerflow.logging import request_id_context

from core import audit
from core.audit import emitter
from core.audit import request as audit_request
from core.audit.formatter import AuditJsonFormatter
from core.audit.testing import find_events, override_registration
from core.factories import ApplicationFactory, RoomFactory, UserFactory
from core.models import Room
from core.recording.event.authentication import MachineUser

pytestmark = pytest.mark.django_db


def test_audit_log_emits_ecs_document(audit_events):
    """A minimal call produces a complete, pruned ECS document."""
    with (
        mock.patch.object(emitter, "service_version", return_value="1.2.3"),
        mock.patch.object(emitter, "service_node_name", return_value="node-1"),
    ):
        audit.log("room.create", target={"sub_type": "room", "id": "1"}, extra="x")

    assert len(audit_events) == 1

    event = audit_events[0]
    event_id = event["event"].pop("id")

    assert uuid.UUID(event_id).version == 4
    assert event["ecs"] == {"version": "9.5.0"}
    assert event["data_stream"] == {
        "type": "logs",
        "dataset": "meet.audit",
        "namespace": "default",
    }
    assert event["service"] == {
        "name": "meet",
        "environment": "test",
        "version": "1.2.3",
        "node": {"name": "node-1"},
    }
    assert event["event"] == {
        "kind": "event",
        "dataset": "meet.audit",
        "action": "room.create",
        "category": ["api"],
        "type": ["info"],
        "outcome": "success",
    }
    assert event["entity"] == {"target": {"sub_type": "room", "id": "1"}}
    assert event["lasuite"] == {
        "actor": {"type": "system"},
        "auth": {"method": "none"},
        "outcome": "success",
        "details": {"extra": "x"},
    }
    assert event["log"]["level"] == "info"
    assert "user" not in event
    assert "organization" not in event


def test_audit_log_identifies_each_event(audit_events):
    """Every event has its own id, so a shipper retrying it cannot duplicate it."""
    audit.log("something")
    audit.log("something")

    assert audit_events[0]["event"]["id"] != audit_events[1]["event"]["id"]


@pytest.mark.parametrize(
    "service_name,namespace,dataset",
    [
        ("meet", "default", "meet.audit"),
        ("La-Suite-Meet", "production", "la_suite_meet.audit"),
    ],
)
def test_audit_log_routes_to_its_data_stream(
    audit_events, settings, service_name, namespace, dataset
):
    """The dataset follows the service name, minus what data stream names forbid."""
    settings.AUDIT_LOG_SERVICE_NAME = service_name
    settings.AUDIT_LOG_DATA_STREAM_NAMESPACE = namespace

    audit.log("something")

    event = audit_events[0]

    assert event["data_stream"] == {
        "type": "logs",
        "dataset": dataset,
        "namespace": namespace,
    }
    assert event["event"]["dataset"] == dataset


def test_audit_log_timestamp_is_utc_with_explicit_offset(audit_events):
    """Timestamps are ISO 8601, millisecond precision, UTC with offset."""
    audit.log("something")

    timestamp = audit_events[0]["@timestamp"]
    parsed = datetime.fromisoformat(timestamp)

    assert timestamp.endswith("+00:00")
    assert parsed.utcoffset().total_seconds() == 0


@pytest.mark.parametrize(
    "outcome,reason,expected",
    [
        ("success", None, ("info", "success", ["info"])),
        ("failure", "validation_error", ("warning", "failure", ["info"])),
        ("denied", "permission_denied", ("warning", "failure", ["denied"])),
        ("failure", "internal_error", ("error", "failure", ["info"])),
        ("unknown", None, ("warning", "unknown", ["info"])),
    ],
)
def test_audit_log_outcome_reason_and_level(audit_events, outcome, reason, expected):
    """The level is derived from the outcome."""
    level, wire_outcome, types = expected

    audit.log("something", outcome=outcome, reason=reason)

    event = audit_events[0]

    assert event["event"]["outcome"] == wire_outcome
    assert event["event"].get("reason") == reason
    assert event["event"]["type"] == types
    assert event["lasuite"]["outcome"] == outcome
    assert event["log"]["level"] == level


def test_audit_log_denied_adds_denied_type_to_explicit_types(audit_events):
    """A denial carries the ``denied`` ECS type in a category expecting it."""
    audit.log("something", outcome="denied", reason="rate_limited", types=["access"])

    event = audit_events[0]

    assert event["event"]["type"] == ["access", "denied"]


def test_audit_log_denied_type_only_where_ecs_expects_it(audit_events):
    """ECS expects no ``denied`` type for an authentication, so none is added."""
    audit.log(
        "user.login",
        outcome="denied",
        reason="authentication_failed",
        category=audit.EventCategory.AUTHENTICATION,
        types=[audit.EventType.START],
    )

    event = audit_events[0]

    assert event["event"]["type"] == ["start"]
    assert event["event"]["outcome"] == "failure"
    assert event["lasuite"]["outcome"] == "denied"


def test_audit_log_failure_type_is_error_where_ecs_expects_it(audit_events):
    """A failure without types is an ``error`` in a category expecting one."""
    audit.log("something", outcome="failure", category=audit.EventCategory.WEB)

    assert audit_events[0]["event"]["type"] == ["error"]


def test_audit_log_accepts_several_categories(audit_events):
    """An event may be filed under several categories, each listed once."""
    audit.log(
        "room.create",
        category=[
            audit.EventCategory.API,
            audit.EventCategory.AUTHENTICATION,
            audit.EventCategory.API,
        ],
        types=[audit.EventType.CREATION],
    )

    assert audit_events[0]["event"]["category"] == ["api", "authentication"]


def test_audit_log_reports_a_misclassified_event_and_still_emits_it(
    audit_events, caplog
):
    """A classification ECS does not expect is an error, yet the event is kept."""
    with caplog.at_level(logging.ERROR, logger="core.audit.emitter"):
        audit.log(
            "something",
            category=audit.EventCategory.AUTHENTICATION,
            types=[audit.EventType.CREATION],
        )

    assert audit_events[0]["event"]["type"] == ["creation"]
    assert "misclassified" in caplog.text


def test_audit_log_accepts_categories_and_types(audit_events):
    """Category and types are validated against the ECS subset."""
    audit.log(
        "user.login",
        category=audit.EventCategory.AUTHENTICATION,
        types=[audit.EventType.START],
    )

    event = audit_events[0]

    assert event["event"]["category"] == ["authentication"]
    assert event["event"]["type"] == ["start"]


def test_audit_log_classifies_an_action_by_its_spec(audit_events):
    """An ``Action`` brings its category and types, and names the event."""
    action = audit.Action(
        "thing.grant",
        category=audit.EventCategory.IAM,
        types=(audit.EventType.CREATION,),
    )

    audit.log(action)

    event = audit_events[0]

    assert event["event"]["action"] == "thing.grant"
    assert event["event"]["category"] == ["iam"]
    assert event["event"]["type"] == ["creation"]


def test_audit_log_arguments_win_over_the_spec(audit_events):
    """A category or types given to ``log`` override those of the ``Action``."""
    action = audit.Action(
        "thing.grant",
        category=audit.EventCategory.IAM,
        types=(audit.EventType.CREATION,),
    )

    audit.log(
        action,
        category=audit.EventCategory.CONFIGURATION,
        types=[audit.EventType.CHANGE],
    )

    event = audit_events[0]

    assert event["event"]["category"] == ["configuration"]
    assert event["event"]["type"] == ["change"]


def test_action_spec_validates_its_classification():
    """A category or type outside the ECS subset fails where it is declared."""
    with pytest.raises(ValueError):
        audit.Action("thing.grant", category="nonsense")
    with pytest.raises(ValueError):
        audit.Action("thing.grant", types=("nonsense",))


def test_action_spec_validates_its_classification_against_ecs():
    """A type the category does not expect in ECS fails where it is declared."""
    with pytest.raises(ValueError, match="does not expect event type end"):
        audit.Action(
            "thing.grant",
            category=audit.EventCategory.WEB,
            types=(audit.EventType.END,),
        )
    with pytest.raises(ValueError, match="in category api"):
        audit.Action("thing.grant", types=(audit.EventType.ERROR,))


def test_audit_log_records_the_error_type(audit_events):
    """The class of an error lands in ``error.type``, next to its message."""
    audit.log(
        "anything",
        outcome="failure",
        reason="internal_error",
        error="boom",
        error_type="builtins.RuntimeError",
    )

    assert audit_events[0]["error"] == {
        "message": "boom",
        "type": "builtins.RuntimeError",
    }


def test_audit_log_fails_open_on_invalid_input(audit_events, caplog):
    """A bad call never raises: it is reported on the application logger."""
    with caplog.at_level(logging.ERROR, logger="core.audit.emitter"):
        audit.log("something", outcome="maybe")

    assert audit_events == []
    assert "could not be built" in caplog.text


def test_audit_log_skips_a_target_field_that_cannot_be_read(audit_events, caplog):
    """A broken registration costs the field, not the event."""
    room = RoomFactory()

    with (
        override_registration(Room, fields=("no_such_field", "slug")),
        caplog.at_level(logging.ERROR, logger="core.audit.targets"),
    ):
        audit.log("anything", target=room)

    [event] = audit_events

    assert event["entity"]["target"] == {
        "id": str(room.pk),
        "sub_type": "room",
        "raw": {"slug": room.slug},
    }
    assert "no_such_field" in caplog.text


def test_audit_log_describes_registered_targets(audit_events):
    """Describe rooms with the fields registered in ``core.auditing``."""
    room = RoomFactory(name="Daily standup")

    audit.log("room.create", target=room)

    assert audit_events[0]["entity"]["target"] == {
        "id": str(room.pk),
        "sub_type": "room",
        "name": "Daily standup",
        "raw": {"slug": room.slug, "access_level": room.access_level},
    }
    assert "user" not in audit_events[0]


def test_audit_log_reports_a_user_target_as_user_target(audit_events):
    """A user acted on is the ``user.target``, its sub only in ``entity.target``."""
    user = UserFactory(email="jane@example.org")

    audit.log("user.provision", target=user)

    event = audit_events[0]

    assert event["user"] == {"target": {"id": str(user.pk), "domain": "example.org"}}
    assert event["entity"]["target"] == {
        "id": str(user.pk),
        "type": ["user"],
        "sub_type": "user",
        "raw": {"sub": user.sub},
    }


def test_audit_log_reports_the_registered_user_target(audit_events):
    """An access names the user it grants a role to as the ``user.target``."""
    room = RoomFactory(users=[(UserFactory(email="jane@example.org"), "member")])
    access = room.accesses.get()

    audit.log("thing.grant", target=access)

    event = audit_events[0]

    assert event["user"] == {
        "target": {"id": str(access.user_id), "domain": "example.org"}
    }
    assert event["entity"]["target"]["sub_type"] == "resourceaccess"


def test_audit_log_explicit_user_target_wins(audit_events):
    """A user target given to ``log`` wins over the one of the target."""
    room = RoomFactory(users=[(UserFactory(), "member")])
    other = UserFactory(email="other@example.net")

    audit.log("thing.grant", target=room.accesses.get(), user_target=other)

    assert audit_events[0]["user"]["target"]["id"] == str(other.pk)


def test_audit_log_registered_entity_type(audit_events):
    """A model registered with an ECS entity type reports it."""
    application = ApplicationFactory()

    audit.log("thing.grant", target=application)

    target = audit_events[0]["entity"]["target"]

    assert target["type"] == ["application"]
    assert target["sub_type"] == "application"
    assert target["name"] == application.name


def test_audit_log_normalises_details(audit_events):
    """Nested details are rendered: enums, models as keys, lists, no ``None``."""
    room = RoomFactory()

    audit.log(
        "something",
        rooms=[room],
        nested={"outcome": audit.Outcome.DENIED},
        empty=None,
    )

    details = audit_events[0]["lasuite"]["details"]

    assert details["rooms"] == [str(room.pk)]
    assert details["nested"] == {"outcome": "denied"}
    assert "empty" not in details


def test_audit_log_reads_request_fields(audit_events):
    """Should read the HTTP fields from the request, the request id from dockerflow."""
    token = request_id_context.set("request-1")
    request = RequestFactory().post(
        "/external-api/v1.0/rooms/",
        data="{}",
        content_type="application/json",
        REMOTE_ADDR="1.2.3.4",
        HTTP_USER_AGENT="Mozilla/5.0 (X11; Linux x86_64)",
    )

    try:
        audit.log("anything", request=request)
    finally:
        request_id_context.reset(token)

    event = audit_events[0]

    assert event["http"] == {"request": {"id": "request-1", "method": "POST"}}
    assert event["url"] == {"path": "/external-api/v1.0/rooms/"}
    assert event["client"] == {"ip": "1.2.3.4"}
    assert event["user_agent"] == {"original": "Mozilla/5.0 (X11; Linux x86_64)"}
    assert "trace" not in event


def test_audit_log_truncates_the_user_agent(audit_events):
    """A user agent is cut where ECS stops indexing it."""
    request = RequestFactory().get("/", HTTP_USER_AGENT="x" * 5000)

    audit.log("anything", request=request)

    assert audit_events[0]["user_agent"]["original"] == "x" * 1024


def test_audit_log_defaults_to_the_request_context(audit_events):
    """Should read the request fields from the context of the request being served."""
    request = RequestFactory().post("/rooms/", REMOTE_ADDR="1.2.3.4")
    request.user = AnonymousUser()
    token = audit_request.set_request_context(
        audit_request.RequestContext.from_request(request)
    )

    try:
        audit.log("anything")
    finally:
        audit_request.reset_request_context(token)

    event = audit_events[0]

    assert event["http"] == {"request": {"method": "POST"}}
    assert event["url"] == {"path": "/rooms/"}
    assert event["client"] == {"ip": "1.2.3.4"}
    assert event["lasuite"]["actor"] == {"type": "anonymous"}


def test_audit_log_explicit_request_wins_over_the_request_context(audit_events):
    """Should prefer the request passed to the one being served."""
    token = audit_request.set_request_context(
        audit_request.RequestContext.from_request(RequestFactory().get("/current/"))
    )

    try:
        audit.log("anything", request=RequestFactory().get("/explicit/"))
    finally:
        audit_request.reset_request_context(token)

    assert audit_events[0]["url"] == {"path": "/explicit/"}


def test_audit_log_reports_the_client_not_the_proxy(audit_events):
    """Should report the forwarded client address, not the one of the proxy."""
    request = RequestFactory().get(
        "/", REMOTE_ADDR="1.2.3.4", HTTP_X_FORWARDED_FOR="5.6.7.8"
    )
    audit.log("something", request=request)

    event = audit_events[0]

    assert event["client"]["ip"] == "5.6.7.8"
    assert event["source"] == {"ip": "5.6.7.8"}


def test_audit_log_actor_user_is_id_sub_and_domain_only(audit_events):
    """A human actor is identified without email or name."""
    user = UserFactory(email="john.doe@example.com", full_name="John Doe")
    request = RequestFactory().get("/")
    request.user = user

    audit.log("anything", request=request)

    event = audit_events[0]

    assert event["user"] == {"id": str(user.pk), "domain": "example.com"}
    assert event["lasuite"]["actor"] == {"type": "user", "sub": user.sub}
    assert event["lasuite"]["auth"] == {"method": "session"}
    assert event["organization"] == {"id": "example.com"}
    assert "John" not in json.dumps(event)
    assert "john.doe" not in json.dumps(event)


@pytest.mark.parametrize(
    "flags,roles",
    [
        ({}, None),
        ({"is_staff": True}, ["staff"]),
        ({"is_staff": True, "is_superuser": True}, ["superuser", "staff"]),
    ],
)
def test_audit_log_actor_roles(audit_events, flags, roles):
    """The privileges of the actor at the time of the event are its roles."""
    request = RequestFactory().get("/")
    request.user = UserFactory(**flags)

    audit.log("anything", request=request)

    assert audit_events[0]["user"].get("roles") == roles


def test_audit_log_anonymous_plain_request_has_no_auth_method(audit_events):
    """A plain Django request without a signed-in user is not authenticated."""
    request = RequestFactory().get("/")
    request.user = AnonymousUser()

    audit.log("anything", request=request)

    assert audit_events[0]["lasuite"]["auth"] == {"method": "none"}


def test_audit_log_actor_application_with_delegated_user(audit_events):
    """A client id in the token payload makes the actor an application."""
    user = UserFactory(email="user@example.com")
    request = RequestFactory().get("/")
    request.user = user
    request.auth = {"client_id": "app-1", "delegated": True}

    audit.log("something", request=request)

    event = audit_events[0]

    assert event["lasuite"]["actor"] == {"type": "application", "sub": user.sub}
    assert event["lasuite"]["application"] == {"client_id": "app-1"}
    assert event["user"] == {"id": str(user.pk), "domain": "example.com"}
    assert event["organization"] == {"id": "app-1"}


def test_audit_log_actor_service(audit_events):
    """Machine users are services, named as the origin of the request."""
    request = RequestFactory().get("/")
    request.user = MachineUser("roomkit")

    audit.log("something", request=request)

    event = audit_events[0]

    assert event["lasuite"]["actor"] == {"type": "service"}
    assert event["service"]["origin"] == {"name": "roomkit"}
    assert "user" not in event
    assert "organization" not in event


def test_audit_log_target_service(audit_events):
    """A peer service the backend called is the target service."""
    audit.log("something", target_service="summary")

    event = audit_events[0]

    assert event["service"]["target"] == {"name": "summary"}
    assert "origin" not in event["service"]
    assert "target_service" not in event.get("lasuite", {}).get("details", {})


def test_audit_log_actor_deleted_user_is_not_a_service(audit_events):
    """A deleted account has no primary key left, yet it is still a user.

    A service is named by its username, which for an account is an email address.
    """
    user = UserFactory(email="john.doe@example.com", admin_email="admin@example.com")
    user.delete()
    request = RequestFactory().get("/")
    request.user = user

    audit.log("anything", request=request)

    event = audit_events[0]

    assert event["lasuite"]["actor"] == {"type": "user", "sub": user.sub}
    assert event["user"] == {"domain": "example.com"}
    assert "admin@example.com" not in json.dumps(event)


def test_audit_log_explicit_overrides(audit_events):
    """Actor, actor type, auth method and client id can be forced."""
    user = UserFactory(email="user@example.com")

    audit.log(
        "something",
        actor=user,
        actor_type="system",
        auth_method="oidc",
        client_id="app-2",
    )

    event = audit_events[0]

    assert event["lasuite"]["actor"] == {"type": "system", "sub": user.sub}
    assert event["lasuite"]["auth"] == {"method": "oidc"}
    assert event["lasuite"]["application"] == {"client_id": "app-2"}
    assert event["user"]["id"] == str(user.pk)
    assert event["organization"] == {"id": "app-2"}


def test_audit_log_explicit_no_actor_ignores_the_signed_in_account(audit_events):
    """``actor=None`` records no account, whoever the request is signed in as."""
    request = RequestFactory().get("/")
    request.user = UserFactory(email="user@example.com")

    audit.log("something", request=request, actor=None)

    event = audit_events[0]

    assert event["lasuite"]["actor"] == {"type": "anonymous"}
    assert "user" not in event
    assert "organization" not in event
    assert "example.com" not in json.dumps(event)


def test_audit_log_explicit_actor_type_alone_keeps_the_signed_in_account(
    audit_events,
):
    """Forcing the actor type does not discard the account of the request."""
    user = UserFactory(email="user@example.com")
    request = RequestFactory().get("/")
    request.user = user

    audit.log("something", request=request, actor_type="anonymous")

    assert audit_events[0]["user"]["id"] == str(user.pk)


def test_audit_log_application_without_an_account(audit_events):
    """An application acting for nobody keeps its tenant but no user."""
    request = RequestFactory().get("/")
    request.user = UserFactory(email="user@example.com")

    audit.log(
        "something",
        request=request,
        actor=None,
        actor_type="application",
        client_id="app-1",
    )

    event = audit_events[0]

    assert event["lasuite"]["actor"] == {"type": "application"}
    assert event["lasuite"]["application"] == {"client_id": "app-1"}
    assert "user" not in event
    assert event["organization"] == {"id": "app-1"}


def test_audit_log_status_code_error_and_message(audit_events):
    """Response status, error message and free text have their ECS slots."""
    audit.log(
        "something",
        outcome="denied",
        reason="permission_denied",
        status_code=403,
        error="Insufficient permissions.",
        message="scope missing",
    )

    event = audit_events[0]

    assert event["http"] == {"response": {"status_code": 403}}
    assert event["error"] == {"message": "Insufficient permissions."}
    assert event["message"] == "scope missing"


def test_audit_json_formatter_renders_one_line_of_json():
    """The formatter emits compact, single-line, non-ASCII friendly JSON."""
    record = logging.makeLogRecord(
        {
            "name": "audit",
            "levelname": "INFO",
            "msg": "anything",
            "audit": {"event": {"action": "anything"}, "note": "multi\nline wörld"},
        }
    )

    rendered = AuditJsonFormatter().format(record)

    assert "\n" not in rendered
    assert "wörld" in rendered
    assert json.loads(rendered) == {
        "event": {"action": "anything"},
        "note": "multi\nline wörld",
        "log": {"level": "info", "logger": "audit"},
    }


def test_audit_json_formatter_wraps_plain_records():
    """A plain record on the audit logger still renders as JSON."""
    record = logging.makeLogRecord(
        {"name": "audit", "levelname": "WARNING", "msg": "log %s", "args": ("x",)}
    )

    rendered = json.loads(AuditJsonFormatter().format(record))

    assert rendered["ecs"] == {"version": "9.5.0"}
    assert rendered["data_stream"]["dataset"] == "meet.audit"
    assert rendered["event"] == {"dataset": "meet.audit", "action": "log x"}
    assert rendered["message"] == "log x"
    assert rendered["@timestamp"].endswith("+00:00")


def test_audit_json_formatter_adds_stack_trace():
    """An attached traceback lands under ``error.stack_trace``."""
    try:
        raise ValueError("boom")
    except ValueError:
        record = logging.makeLogRecord(
            {"name": "audit", "levelname": "ERROR", "msg": "x", "audit": {}}
        )
        record.exc_info = sys.exc_info()

    rendered = json.loads(AuditJsonFormatter().format(record))

    assert "ValueError: boom" in rendered["error"]["stack_trace"]


def test_find_events_filters_by_action(audit_events):
    """The test helper narrows captured events by action."""
    audit.log("first")
    audit.log("second")

    found = find_events(audit_events, "second")

    assert [event["event"]["action"] for event in found] == ["second"]
