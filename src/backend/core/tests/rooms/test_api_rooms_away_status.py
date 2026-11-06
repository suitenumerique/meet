"""Security and validation tests for the away-status endpoint."""

# pylint: disable=missing-function-docstring,redefined-outer-name

from unittest import mock

from django.contrib.auth.models import AnonymousUser
from django.urls import reverse

import pytest
from livekit.api import TwirpError
from rest_framework import status
from rest_framework.test import APIClient

from core import utils
from core.factories import RoomFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def room():
    return RoomFactory()


@pytest.fixture
def user():
    return UserFactory()


@pytest.fixture
def token(room, user):
    return utils.generate_token(room=str(room.id), user=user)


@pytest.fixture
def mock_livekit_client():
    with mock.patch("core.utils.create_livekit_client") as client_factory:
        client = mock.AsyncMock()
        client_factory.return_value = client
        yield client


def request_away(room, token, payload):
    return APIClient().post(
        reverse("rooms-set-away-status", kwargs={"pk": room.id}),
        payload,
        format="json",
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {token}",
    )


@pytest.mark.parametrize("case", [(True, "away"), (False, "")])
def test_only_token_identity_can_be_updated(
    mock_livekit_client, room, user, token, case
):
    away, attribute = case
    response = request_away(room, token, {"away": away, "identity": "someone-else"})
    assert response.status_code == status.HTTP_200_OK
    payload = mock_livekit_client.room.update_participant.call_args.args[0]
    assert payload.identity == str(user.sub)
    assert payload.attributes == {"awayStatus": attribute}


@pytest.mark.parametrize(
    "payload", [{}, {"away": "invalid"}, {"away": {"nested": True}}]
)
def test_invalid_input_is_rejected(room, token, payload):
    assert request_away(room, token, payload).status_code == status.HTTP_400_BAD_REQUEST


def test_missing_token_is_forbidden(room):
    response = APIClient().post(
        reverse("rooms-set-away-status", kwargs={"pk": room.id}),
        {"away": True},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_wrong_room_token_is_forbidden(room, user):
    other = RoomFactory()
    token = utils.generate_token(room=str(other.id), user=user)
    assert (
        request_away(room, token, {"away": True}).status_code
        == status.HTTP_403_FORBIDDEN
    )


def test_anonymous_participant_uses_token_identity(mock_livekit_client, room):
    token = utils.generate_token(
        room=str(room.id), user=AnonymousUser(), participant_id="anonymous-meet-test"
    )
    response = request_away(room, token, {"away": True})
    assert response.status_code == status.HTTP_200_OK
    payload = mock_livekit_client.room.update_participant.call_args.args[0]
    assert payload.identity == "anonymous-meet-test"


def test_livekit_failure_does_not_claim_success(mock_livekit_client, room, token):
    """A failed LiveKit update is not reported as a successful transition."""
    mock_livekit_client.room.update_participant.side_effect = TwirpError(
        msg="Internal server error", code="unknown", status=500
    )
    response = request_away(room, token, {"away": True})
    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data == {"error": "Failed to update participant away status"}


def test_get_method_is_not_allowed(room, token):
    """State changes must not be possible with a GET request."""
    response = APIClient().get(
        reverse("rooms-set-away-status", kwargs={"pk": room.id}),
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {token}",
    )
    assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.parametrize("away,expected", [(True, "away"), (False, "")])
def test_unregistered_room_updates_only_requester(
    settings, mock_livekit_client, away, expected
):
    """A signed grant for a spontaneous room can only update its own identity."""
    settings.ALLOW_UNREGISTERED_ROOMS = True
    slug = "caf-paus-test"
    token = utils.generate_token(
        room=slug, user=AnonymousUser(), participant_id="anonymous-spontaneous"
    )
    response = APIClient().post(
        reverse("rooms-set-away-status", kwargs={"pk": slug}),
        {"away": away, "identity": "another-user"},
        format="json",
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {token}",
    )
    assert response.status_code == status.HTTP_200_OK
    payload = mock_livekit_client.room.update_participant.call_args.args[0]
    assert payload.room == slug
    assert payload.identity == "anonymous-spontaneous"
    assert payload.attributes == {"awayStatus": expected}


def test_unregistered_room_rejects_other_room_token(settings, mock_livekit_client):
    """A signed grant for another room must not modify the target."""
    settings.ALLOW_UNREGISTERED_ROOMS = True
    token = utils.generate_token(
        room="room-one-test", user=AnonymousUser(), participant_id="anon-test"
    )
    response = APIClient().post(
        reverse("rooms-set-away-status", kwargs={"pk": "room-two-test"}),
        {"away": True},
        format="json",
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {token}",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    mock_livekit_client.room.update_participant.assert_not_called()


def test_unregistered_room_disabled_rejects_modification(settings, mock_livekit_client):
    """Disabled spontaneous rooms must be rejected without reaching LiveKit."""
    settings.ALLOW_UNREGISTERED_ROOMS = False
    token = utils.generate_token(
        room="caf-paus-test", user=AnonymousUser(), participant_id="anon-test"
    )
    response = APIClient().post(
        reverse("rooms-set-away-status", kwargs={"pk": "caf-paus-test"}),
        {"away": True},
        format="json",
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {token}",
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    mock_livekit_client.room.update_participant.assert_not_called()


def test_registered_room_rejects_other_valid_room_token(mock_livekit_client, room):
    """A token issued for an unregistered room cannot update a registered one."""
    token = utils.generate_token(
        room="caf-paus-test", user=AnonymousUser(), participant_id="anon-test"
    )
    response = request_away(room, token, {"away": True})
    assert response.status_code == status.HTTP_403_FORBIDDEN
    mock_livekit_client.room.update_participant.assert_not_called()
