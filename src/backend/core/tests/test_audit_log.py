"""
Test audit.py
"""

# pylint: disable=W0621,redefined-outer-name

import json
import logging

from django.test import RequestFactory

import pytest

from core.audit import AuditJsonFormatter, extract_request_fields, getLogger


class ExampleRoomModel:
    """Example for an audited object."""

    def __init__(self, name, slug, access_level):
        self.name = name
        self.slug = slug
        self.access_level = access_level


def serialize_example_room(room):
    """Flatten a ``ExampleRoomModel`` into the audit fields a service would expose."""
    return {
        "name": room.name,
        "slug": room.slug,
        "access_level": room.access_level,
    }


# Audit logger wired with the local serializer, mirroring how a service
# registers its own object serializers.
test_audit_logger = getLogger(
    "core.tests.test_audit_2",
    custom_serializers=[(ExampleRoomModel, serialize_example_room)],
)


class _CaptureHandler(logging.Handler):
    """Collect every record routed to the ``audit`` logger tree."""

    def __init__(self):
        super().__init__()
        self.records = []

    def emit(self, record):
        self.records.append(record)


@pytest.fixture
def audit_records():
    """Yield audit records, capturing children via propagation to ``audit``.

    The viewsets log on ``audit.core.external_api.viewsets``; attaching to the
    root ``audit`` logger captures those propagated records as well as ones
    emitted directly on it.
    """
    handler = _CaptureHandler()
    logger = logging.getLogger("audit")
    logger.addHandler(handler)
    previous_level = logger.level
    logger.setLevel(logging.DEBUG)
    try:
        yield handler.records
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)


def _payloads(records, event_type):
    """Return the audit payloads matching ``event_type``."""
    return [r.audit for r in records if r.audit.get("event_type") == event_type]


# ---------------------------------------------------------------------------
# core.audit - custom serializer flattening
# ---------------------------------------------------------------------------


def test_room_extra_is_flattened_via_custom_serializer(audit_records):
    """A ``Room`` keyword is expanded into dotted ``room.<field>`` keys."""
    room = ExampleRoomModel(
        name="Talking About Vacation",
        slug="talking-about-vacations",
        access_level="restricted",
    )

    test_audit_logger.info("event", request=None, room=room)

    audit = audit_records[0].audit
    assert audit["room.name"] == "Talking About Vacation"
    assert audit["room.slug"] == "talking-about-vacations"
    assert audit["room.access_level"] == "restricted"
    # The raw object is replaced by its serialized fields, not kept.
    assert "room" not in audit


def test_non_registered_extras_pass_through_unchanged(audit_records):
    """Values without a matching serializer are kept verbatim."""
    room = ExampleRoomModel(
        name="Back To Work", slug="back-to-work", access_level="public"
    )

    test_audit_logger.info(
        "event",
        request=None,
        room=room,
        client_id="test-id",
        target={"user_id": "u1"},
    )

    audit = audit_records[0].audit
    assert audit["client_id"] == "test-id"
    # A dict has no registered serializer, so it stays nested as-is.
    assert audit["target"] == {"user_id": "u1"}
    # The Room alongside it is still flattened.
    assert audit["room.name"] == "Back To Work"


# ---------------------------------------------------------------------------
# core.audit - getLogger naming & request field extraction
# ---------------------------------------------------------------------------


def test_getlogger_nests_module_name_under_audit():
    """A named logger sits under ``audit.`` so it inherits its handlers."""
    assert getLogger("core.foo")._logger.name == "audit.core.foo"


def test_getlogger_without_name_uses_base_audit_logger():
    """Empty ``audit`` names resolve to the bare ``audit`` logger."""
    assert getLogger()._logger.name == "audit"
    assert getLogger("audit")._logger.name == "audit"


def test_extract_request_fields_collects_request_metadata():
    """All request-derived fields are populated from request META."""
    request = RequestFactory().post(
        "/external-api/v1.0/rooms/",
        REMOTE_ADDR="10.0.0.5",
        REMOTE_PORT="54321",
        HTTP_USER_AGENT="pytest-agent",
        HTTP_REFERER="https://example.test/from",
        HTTP_X_FORWARDED_FOR="203.0.113.7, 10.0.0.5",
    )

    fields = extract_request_fields(request)

    # X-Forwarded-For wins over REMOTE_ADDR for the client IP.
    assert fields["source_ip"] == "203.0.113.7"
    assert fields["source_port"] == "54321"
    assert fields["request_path"] == "/external-api/v1.0/rooms/"
    assert fields["request_method"] == "POST"
    assert fields["user_agent"] == "pytest-agent"
    assert fields["referer"] == "https://example.test/from"
    assert fields["request_url"].endswith("/external-api/v1.0/rooms/")


# ---------------------------------------------------------------------------
# core.audit - exception level & JSON rendering of flattened fields
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method_name,expected_level",
    [
        ("debug", logging.DEBUG),
        ("info", logging.INFO),
        ("warning", logging.WARNING),
        ("error", logging.ERROR),
        ("critical", logging.CRITICAL),
    ],
)
def test_level_is_passed_to_record(audit_records, method_name, expected_level):
    """Each per-level method emits a record carrying that level."""
    getattr(test_audit_logger, method_name)("event", request=None)

    record = audit_records[0]
    assert record.levelno == expected_level
    assert record.levelname == method_name.upper()


def test_level_is_rendered_in_json_payload(audit_records):
    """The JSON formatter surfaces the record level under ``level``."""
    test_audit_logger.warning("event", request=None)

    rendered = json.loads(AuditJsonFormatter().format(audit_records[0]))
    assert rendered["level"] == "WARNING"


def test_exception_logs_error_with_active_traceback(audit_records):
    """``exception`` emits at ERROR and captures the active traceback."""
    try:
        raise ValueError("boom")
    except ValueError:
        test_audit_logger.exception("operation.failed", request=None)

    record = audit_records[0]
    assert record.levelno == logging.ERROR
    # exc_info is the live traceback tuple, never part of the audit payload.
    assert record.exc_info is not None
    assert "exc_info" not in record.audit
