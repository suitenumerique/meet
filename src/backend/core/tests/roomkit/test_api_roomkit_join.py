"""
Test the roomkit join server-to-server API endpoint.
"""

# pylint: disable=redefined-outer-name,unused-argument

from unittest import mock

import pytest

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
def test_join_wrong_bearer(mock_sip_management, settings, client):
    """Requests with an incorrect bearer token should be rejected."""

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
def test_join_roomkit_disabled(mock_sip_management, settings, client):
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
def test_join_wrong_pin_length(mock_sip_management, settings, client):
    """Requests with a PIN code of unexpected length should be rejected."""

    mock_sip_instance = mock_sip_management.return_value

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"
    settings.ROOM_TELEPHONY_PIN_LENGTH = 10

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": "123"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 400
    assert response.json() == {"pin_code": ["PIN code length is invalid."]}
    mock_sip_instance.ensure_dispatch_rule.assert_not_called()


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_unknown_pin(mock_sip_management, settings, client):
    """Requests with a PIN matching no room should return 404 and create no rule."""

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


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_success(mock_sip_management, settings, client):
    """Requests with a valid PIN should create the dispatch rule."""

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
    assert response.json() == {"status": "success"}
    mock_sip_instance.ensure_dispatch_rule.assert_called_once_with(room)


@mock.patch("core.roomkit.viewsets.SIPManagement")
def test_join_dispatch_rule_already_exists(mock_sip_management, settings, client):
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
def test_join_sip_failure(mock_sip_management, mock_capture, settings, client):
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
