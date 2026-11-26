"""
Test the roomkit join server-to-server API endpoint.
"""

# pylint: disable=redefined-outer-name,unused-argument

import json
from unittest import mock

import pytest

from ...api.throttling import RoomKitJoinRateThrottle
from ...audit.testing import find_events
from ...factories import RoomFactory
from ...services.sip_management import SIPException

pytestmark = pytest.mark.django_db


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_anonymous(mock_sip_management, settings, client):
    """Requests without an Authorization header should be rejected."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")

    response = client.post("/api/v1.0/roomkit/join/", {"pin_code": room.pin_code})

    assert response.status_code == 401
    assert response.json() == {"detail": "Authorization header is missing."}
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_malformed_authorization_header(mock_sip_management, settings, client):
    """Requests with a malformed Authorization header should be rejected."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="testAuthToken",
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid authorization header."}
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_wrong_bearer(mock_sip_management, settings, client, audit_events):
    """Requests with an incorrect bearer token should be rejected and audited."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer wrongAuthToken",
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid server-to-server token."}
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()

    [event] = find_events(audit_events, "roomkit.join")

    assert event["event"]["category"] == ["api", "authentication"]
    assert event["event"]["type"] == ["start", "denied"]
    assert event["event"]["reason"] == "authentication_failed"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["actor"] == {"type": "anonymous"}
    assert event["lasuite"]["auth"] == {"method": "none"}
    assert "origin" not in event["service"]
    assert "entity" not in event
    assert event["error"]["message"] == "Invalid server-to-server token."
    assert room.pin_code not in json.dumps(event)


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_token_not_configured(mock_sip_management, settings, client):
    """Requests should be rejected when no server-to-server token is configured."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = None

    room = RoomFactory(pin_code="1234567890")

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 401
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_roomkit_disabled(mock_sip_management, settings, client, audit_events):
    """The endpoint should not be exposed when the roomkit integration is disabled."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = False
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 404
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()

    [event] = find_events(audit_events, "roomkit.join")

    assert event["event"]["reason"] == "not_found"
    assert event["lasuite"]["outcome"] == "failure"
    assert event["service"]["origin"] == {"name": "roomkit"}
    assert "entity" not in event


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_missing_pin(mock_sip_management, settings, client):
    """Requests without a PIN code should be rejected."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 400
    assert response.json() == {"pin_code": ["This field is required."]}
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_blank_pin(mock_sip_management, settings, client):
    """Requests with a blank PIN code should be rejected."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": ""},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 400
    assert response.json() == {"pin_code": ["This field may not be blank."]}
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_wrong_pin_length(mock_sip_management, settings, client, audit_events):
    """Requests with a PIN code of unexpected length should be rejected and audited."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"
    settings.ROOM_TELEPHONY_PIN_LENGTH = 10

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": "98765432101"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 400
    assert response.json() == {"pin_code": ["PIN code length is invalid."]}
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()

    [event] = find_events(audit_events, "roomkit.join")

    assert event["event"]["type"] == ["start"]
    assert event["event"]["reason"] == "validation_error"
    assert event["lasuite"]["outcome"] == "failure"
    assert event["service"]["origin"] == {"name": "roomkit"}
    assert "entity" not in event
    assert "98765432101" not in json.dumps(event)


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_unknown_pin(mock_sip_management, settings, client, audit_events):
    """An unknown PIN should return 404, create no rule and be audited as refused."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    RoomFactory(pin_code="1234567890")

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": "0987654321"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "No room found for this PIN code."}
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()

    [event] = find_events(audit_events, "roomkit.join")

    assert event["event"]["type"] == ["start", "denied"]
    assert event["event"]["outcome"] == "failure"
    assert event["event"]["reason"] == "not_found"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["actor"] == {"type": "service"}
    assert event["service"]["origin"] == {"name": "roomkit"}
    assert "entity" not in event
    assert event["error"]["message"] == "No room found for this PIN code."
    assert "0987654321" not in json.dumps(event)
    assert "1234567890" not in json.dumps(event)


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_success(mock_sip_management, settings, client, audit_events):
    """Requests with a valid PIN should create the dispatch rule and be audited."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")
    mock_sip_instance.ensure_dispatch_rule.return_value = True

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
        HTTP_USER_AGENT="livekit-sip/1.0",
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    mock_sip_instance.ensure_dispatch_rule.assert_called_once_with(room)

    [event] = find_events(audit_events, "roomkit.join")

    assert event["event"]["category"] == ["api"]
    assert event["event"]["type"] == ["start"]
    assert event["lasuite"]["outcome"] == "success"
    assert event["lasuite"]["actor"] == {"type": "service"}
    assert event["lasuite"]["auth"] == {"method": "shared_secret"}
    assert event["service"]["origin"] == {"name": "roomkit"}
    assert "user" not in event
    assert event["user_agent"] == {"original": "livekit-sip/1.0"}
    assert event["entity"]["target"]["id"] == str(room.pk)
    assert event["entity"]["target"]["sub_type"] == "room"
    assert event["lasuite"]["details"] == {"dispatch_rule_created": True}
    assert room.pin_code not in json.dumps(event)


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_dispatch_rule_already_exists(
    mock_sip_management, settings, client, audit_events
):
    """Requests should succeed when the dispatch rule already exists (idempotency)."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")
    mock_sip_instance.ensure_dispatch_rule.return_value = False

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    mock_sip_instance.ensure_dispatch_rule.assert_called_once_with(room)

    [event] = find_events(audit_events, "roomkit.join")

    assert event["lasuite"]["details"] == {"dispatch_rule_created": False}


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_throttled(mock_sip_management, settings, client, audit_events):
    """Throttled requests should be rejected and audited as rate limited."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")

    with (
        mock.patch.object(RoomKitJoinRateThrottle, "allow_request", return_value=False),
        mock.patch.object(RoomKitJoinRateThrottle, "wait", return_value=30),
    ):
        response = client.post(
            "/api/v1.0/roomkit/join/",
            {"pin_code": room.pin_code},
            HTTP_AUTHORIZATION="Bearer testAuthToken",
        )

    assert response.status_code == 429
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()

    [event] = find_events(audit_events, "roomkit.join")

    assert event["event"]["type"] == ["start", "denied"]
    assert event["event"]["reason"] == "rate_limited"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["service"]["origin"] == {"name": "roomkit"}
    assert "entity" not in event


@mock.patch("core.roomkit.viewsets.analytics.capture")
@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_tracks_analytics_event(
    mock_sip_management, mock_capture, settings, client
):
    """Successful joins should be tracked with an analytics event."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")
    mock_sip_instance.ensure_dispatch_rule.return_value = True

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 200
    mock_capture.assert_called_once()
    _user, event, properties = mock_capture.call_args[0]
    assert str(event) == "roomkit_joined"
    assert properties == {
        "room_id": str(room.pk),
        "dispatch_rule_created": True,
    }


@mock.patch("core.roomkit.viewsets.analytics.capture")
@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_sip_failure(
    mock_sip_management, mock_capture, settings, client, audit_events
):
    """Requests should fail with a server error when the sip management service fails."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")
    mock_sip_instance.ensure_dispatch_rule.side_effect = SIPException(
        "Could not create dispatch rule"
    )

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
        raise_request_exception=False,
    )

    assert response.status_code == 500
    mock_sip_instance.ensure_dispatch_rule.assert_called_once_with(room)
    mock_capture.assert_not_called()

    [event] = find_events(audit_events, "roomkit.join")

    assert event["event"]["reason"] == "internal_error"
    assert event["lasuite"]["outcome"] == "failure"
    assert event["log"]["level"] == "error"
    assert event["entity"]["target"]["id"] == str(room.pk)
    assert event["error"]["message"] == "Could not create dispatch rule."
    assert "details" not in event["lasuite"]
