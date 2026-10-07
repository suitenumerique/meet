"""Tests for building and emitting audit events."""

import json
import logging
import sys
from datetime import datetime

from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

import pytest
from dockerflow.logging import request_id_context

from core import audit
from core.audit import request as audit_request
from core.audit.formatter import AuditJsonFormatter
from core.audit.testing import find_events, override_registration
from core.factories import RoomFactory, UserFactory
from core.models import Room
from core.recording.event.authentication import MachineUser

pytestmark = pytest.mark.django_db


def test_audit_log_emits_ecs_document(audit_events):
    """A minimal call produces a complete, pruned ECS document."""
    audit.log("room.create", target={"type": "room", "id": "1"}, extra="x")

    assert len(audit_events) == 1

    event = audit_events[0]

    assert event["log_type"] == "audit"
    assert event["ecs"] == {"version": "9.5.0"}
    assert event["service"] == {"name": "meet", "environment": "test"}
    assert event["event"] == {
        "kind": "event",
        "action": "room.create",
        "category": ["web"],
        "type": ["info"],
        "outcome": "success",
    }
    assert event["lasuite"] == {
        "actor": {"type": "system"},
        "auth": {"method": "none"},
        "outcome": "success",
        "target": {"type": "room", "id": "1"},
        "details": {"extra": "x"},
    }
    assert event["log"]["level"] == "info"
    assert "user" not in event
    assert "organization" not in event


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
        ("failure", "validation_error", ("warning", "failure", ["error"])),
        ("denied", "permission_denied", ("warning", "failure", ["denied"])),
        ("failure", "internal_error", ("error", "failure", ["error"])),
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
    """A denial always carries the ``denied`` ECS type."""
    audit.log("something", outcome="denied", reason="rate_limited", types=["access"])

    event = audit_events[0]

    assert event["event"]["type"] == ["access", "denied"]


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

    assert event["lasuite"]["target"] == {
        "type": "room",
        "id": str(room.pk),
        "slug": room.slug,
    }
    assert "no_such_field" in caplog.text


def test_audit_log_describes_registered_targets(audit_events):
    """Describe rooms with the fields registered in ``core.auditing``."""
    room = RoomFactory(name="Daily standup")

    audit.log("room.create", target=room)

    assert audit_events[0]["lasuite"]["target"] == {
        "type": "room",
        "id": str(room.pk),
        "slug": room.slug,
        "name": "Daily standup",
        "access_level": room.access_level,
    }


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
    """Should read the HTTP fields from the request, the trace id from dockerflow."""
    token = request_id_context.set("trace-1")
    request = RequestFactory().post(
        "/external-api/v1.0/rooms/",
        data="{}",
        content_type="application/json",
        REMOTE_ADDR="1.2.3.4",
    )

    try:
        audit.log("anything", request=request)
    finally:
        request_id_context.reset(token)

    event = audit_events[0]

    assert event["http"] == {"request": {"method": "POST"}}
    assert event["url"] == {"path": "/external-api/v1.0/rooms/"}
    assert event["client"] == {"ip": "1.2.3.4"}
    assert event["trace"] == {"id": "trace-1"}


def test_audit_log_defaults_to_the_current_request(audit_events):
    """Should read the request fields from the request being served."""
    request = RequestFactory().post("/rooms/", REMOTE_ADDR="1.2.3.4")
    request.user = AnonymousUser()
    token = audit_request.set_current_request(request)

    try:
        audit.log("anything")
    finally:
        audit_request.reset_current_request(token)

    event = audit_events[0]

    assert event["http"] == {"request": {"method": "POST"}}
    assert event["url"] == {"path": "/rooms/"}
    assert event["client"] == {"ip": "1.2.3.4"}
    assert event["lasuite"]["actor"] == {"type": "anonymous"}


def test_audit_log_explicit_request_wins_over_the_current_one(audit_events):
    """Should prefer the request passed to the one being served."""
    token = audit_request.set_current_request(RequestFactory().get("/current/"))

    try:
        audit.log("anything", request=RequestFactory().get("/explicit/"))
    finally:
        audit_request.reset_current_request(token)

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

    assert event["user"] == {
        "id": str(user.pk),
        "sub": user.sub,
        "domain": "example.com",
    }
    assert event["lasuite"]["actor"] == {"type": "user"}
    assert event["lasuite"]["auth"] == {"method": "session"}
    assert event["organization"] == {"id": "example.com"}
    assert "John" not in json.dumps(event)
    assert "john.doe" not in json.dumps(event)


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

    assert event["lasuite"]["actor"] == {"type": "application"}
    assert event["lasuite"]["application"] == {"client_id": "app-1"}
    assert event["user"] == {
        "id": str(user.pk),
        "sub": user.sub,
        "domain": "example.com",
    }
    assert event["organization"] == {"id": "app-1"}


def test_audit_log_actor_service(audit_events):
    """Machine users are services identified by name."""
    request = RequestFactory().get("/")
    request.user = MachineUser("roomkit")

    audit.log("something", request=request)

    event = audit_events[0]

    assert event["lasuite"]["actor"] == {"type": "service", "name": "roomkit"}
    assert "user" not in event
    assert "organization" not in event


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

    assert event["lasuite"]["actor"] == {"type": "user"}
    assert event["user"] == {"sub": user.sub, "domain": "example.com"}
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

    assert event["lasuite"]["actor"] == {"type": "system"}
    assert event["lasuite"]["auth"] == {"method": "oidc"}
    assert event["lasuite"]["application"] == {"client_id": "app-2"}
    assert event["user"]["id"] == str(user.pk)
    assert event["organization"] == {"id": "app-2"}


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

    assert rendered["log_type"] == "audit"
    assert rendered["event"] == {"action": "log x"}
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
