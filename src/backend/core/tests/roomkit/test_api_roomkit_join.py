"""
Test the roomkit join server-to-server API endpoint.
"""

# pylint: disable=redefined-outer-name,unused-argument

from unittest import mock

import pytest

from ...factories import RoomFactory
from ...services.telephony import TelephonyException

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_telephony_service():
    """Mock the TelephonyService used by the roomkit viewset."""
    with mock.patch("core.roomkit.viewsets.TelephonyService") as mock_service_class:
        yield mock_service_class.return_value


def test_join_anonymous(settings, mock_telephony_service, client):
    """Requests without an Authorization header should be rejected."""
    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")

    response = client.post("/api/v1.0/roomkit/join/", {"pin_code": room.pin_code})

    assert response.status_code == 401
    assert response.json() == {"detail": "Authorization header is missing."}
    mock_telephony_service.ensure_dispatch_rule.assert_not_called()


def test_join_malformed_authorization_header(settings, mock_telephony_service, client):
    """Requests with a malformed Authorization header should be rejected."""
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
    mock_telephony_service.ensure_dispatch_rule.assert_not_called()


def test_join_wrong_bearer(settings, mock_telephony_service, client):
    """Requests with an incorrect bearer token should be rejected."""
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
    mock_telephony_service.ensure_dispatch_rule.assert_not_called()


def test_join_token_not_configured(settings, mock_telephony_service, client):
    """Requests should be rejected when no server-to-server token is configured."""

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = None

    room = RoomFactory(pin_code="1234567890")

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 401
    mock_telephony_service.ensure_dispatch_rule.assert_not_called()


def test_join_roomkit_disabled(settings, mock_telephony_service, client):
    """The endpoint should not be exposed when the roomkit integration is disabled."""

    settings.ROOMKIT_ENABLED = False
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 404
    mock_telephony_service.ensure_dispatch_rule.assert_not_called()


def test_join_missing_pin(settings, mock_telephony_service, client):
    """Requests without a PIN code should be rejected."""

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 400
    assert response.json() == {"pin_code": ["This field is required."]}
    mock_telephony_service.ensure_dispatch_rule.assert_not_called()


def test_join_blank_pin(settings, mock_telephony_service, client):
    """Requests with a blank PIN code should be rejected."""

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": ""},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 400
    assert response.json() == {"pin_code": ["This field may not be blank."]}
    mock_telephony_service.ensure_dispatch_rule.assert_not_called()


def test_join_wrong_pin_length(settings, mock_telephony_service, client):
    """Requests with a PIN code of unexpected length should be rejected."""

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
    mock_telephony_service.ensure_dispatch_rule.assert_not_called()


def test_join_unknown_pin(settings, mock_telephony_service, client):
    """Requests with a PIN matching no room should return 404 and create no rule."""
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
    mock_telephony_service.ensure_dispatch_rule.assert_not_called()


def test_join_success(settings, mock_telephony_service, client):
    """Requests with a valid PIN should create the dispatch rule."""
    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")
    mock_telephony_service.ensure_dispatch_rule.return_value = True

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    mock_telephony_service.ensure_dispatch_rule.assert_called_once_with(room)


def test_join_dispatch_rule_already_exists(settings, mock_telephony_service, client):
    """Requests should succeed when the dispatch rule already exists (idempotency)."""

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")
    mock_telephony_service.ensure_dispatch_rule.return_value = False

    response = client.post(
        "/api/v1.0/roomkit/join/",
        {"pin_code": room.pin_code},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    mock_telephony_service.ensure_dispatch_rule.assert_called_once_with(room)


def test_join_tracks_analytics_event(settings, mock_telephony_service, client):
    """Successful joins should be tracked with an analytics event."""

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")
    mock_telephony_service.ensure_dispatch_rule.return_value = True

    with mock.patch("core.roomkit.viewsets.analytics.capture") as mock_capture:
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


def test_join_telephony_failure(settings, mock_telephony_service, client):
    """Requests should fail with a server error when the telephony service fails."""

    settings.ROOMKIT_ENABLED = True
    settings.ROOMKIT_SERVER_TO_SERVER_API_TOKEN = "testAuthToken"

    room = RoomFactory(pin_code="1234567890")
    mock_telephony_service.ensure_dispatch_rule.side_effect = TelephonyException(
        "Could not create dispatch rule"
    )

    with mock.patch("core.roomkit.viewsets.analytics.capture") as mock_capture:
        response = client.post(
            "/api/v1.0/roomkit/join/",
            {"pin_code": room.pin_code},
            HTTP_AUTHORIZATION="Bearer testAuthToken",
            raise_request_exception=False,
        )

    assert response.status_code == 500
    mock_telephony_service.ensure_dispatch_rule.assert_called_once_with(room)
    mock_capture.assert_not_called()
