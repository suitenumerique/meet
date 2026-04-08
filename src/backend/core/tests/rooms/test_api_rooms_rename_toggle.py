"""
Test rooms API endpoints: toggle hand and rename participant.
"""

# pylint: disable=redefined-outer-name,unused-argument,protected-access

from unittest import mock
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.urls import reverse

import pytest
from freezegun import freeze_time
from livekit.api import TwirpError
from rest_framework import status
from rest_framework.test import APIClient

from core import utils
from core.factories import RoomFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_livekit_client():
    """Mock LiveKit API client."""
    with mock.patch("core.utils.create_livekit_client") as mock_create:
        mock_client = mock.AsyncMock()
        mock_create.return_value = mock_client
        yield mock_client


@pytest.fixture
def room():
    """Create a room."""
    return RoomFactory()


@pytest.fixture
def user():
    """Create a user."""
    return UserFactory()


@pytest.fixture
def token(room, user):
    """Generate a real LiveKit JWT for the user in the room."""
    return utils.generate_token(room=str(room.id), user=user)


@pytest.fixture
def anonymous_token(room):
    """Generate a real LiveKit JWT for an anonymous user in the room."""
    return utils.generate_token(
        room=str(room.id),
        user=AnonymousUser(),
        participant_id="anon-participant-id",
    )


# ---
# toggle-hand
# ---


def test_toggle_hand_raise_success(mock_livekit_client, room, token):
    """Test successfully raising a participant's hand."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(url, {"raised": True, "token": token}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.update_participant.assert_called_once()
    mock_livekit_client.aclose.assert_called_once()


def test_toggle_hand_lower_success(mock_livekit_client, room, token):
    """Test successfully lowering a participant's hand."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(url, {"raised": False, "token": token}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    call_kwargs = mock_livekit_client.room.update_participant.call_args
    assert call_kwargs[0][0].attributes["handRaisedAt"] == ""

    mock_livekit_client.aclose.assert_called_once()


def test_toggle_hand_raise_sets_timestamp(mock_livekit_client, room, token):
    """Test that raising a hand sets a non-empty ISO timestamp as the attribute."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(url, {"raised": True, "token": token}, format="json")

    assert response.status_code == status.HTTP_200_OK

    call_kwargs = mock_livekit_client.room.update_participant.call_args
    assert call_kwargs[0][0].attributes["handRaisedAt"] != ""


def test_toggle_hand_identity_derived_from_token(
    mock_livekit_client, room, token, user
):
    """Test that the participant identity is derived from the token, not supplied by the client."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    client.post(url, {"raised": True, "token": token}, format="json")

    call_kwargs = mock_livekit_client.room.update_participant.call_args
    assert call_kwargs[0][0].identity == str(user.sub)


def test_toggle_hand_missing_raised_field(room, token):
    """Test toggle hand with missing raised field returns 400."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(url, {"token": token}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "raised" in response.data


def test_toggle_hand_invalid_raised_field(room, token):
    """Test toggle hand with non-boolean raised field returns 400."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(
        url, {"raised": "not-a-boolean", "token": token}, format="json"
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_toggle_hand_forbidden_without_token(room):
    """Test toggle hand returns 403 when no LiveKit token is provided."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(url, {"raised": True}, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_toggle_hand_forbidden_token_for_wrong_room(user):
    """Test toggle hand returns 403 when the token is scoped to a different room."""
    wrong_room = RoomFactory()
    target_room = RoomFactory()
    wrong_token = utils.generate_token(room=str(wrong_room.id), user=user)

    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": target_room.id})
    response = client.post(url, {"raised": True, "token": wrong_token}, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_toggle_hand_unexpected_twirp_error(mock_livekit_client, room, token):
    """Test toggle hand when LiveKit API raises TwirpError."""
    mock_livekit_client.room.update_participant.side_effect = TwirpError(
        msg="Internal server error", code="unknown", status=500
    )

    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(url, {"raised": True, "token": token}, format="json")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data == {"error": "Failed to update participant hand state"}

    mock_livekit_client.aclose.assert_called_once()


def test_toggle_hand_raise_success_anonymous(
    mock_livekit_client, room, anonymous_token
):
    """Test successfully raising hand as an anonymous participant."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(
        url, {"raised": True, "token": anonymous_token}, format="json"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.update_participant.assert_called_once()
    mock_livekit_client.aclose.assert_called_once()


def test_toggle_hand_lower_success_anonymous(
    mock_livekit_client, room, anonymous_token
):
    """Test successfully lowering hand as an anonymous participant."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(
        url, {"raised": False, "token": anonymous_token}, format="json"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    call_kwargs = mock_livekit_client.room.update_participant.call_args
    assert call_kwargs[0][0].attributes["handRaisedAt"] == ""


def test_toggle_hand_identity_derived_from_token_anonymous(
    mock_livekit_client, room, anonymous_token
):
    """Test that identity is derived from participant_id for anonymous users."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    client.post(url, {"raised": True, "token": anonymous_token}, format="json")

    call_kwargs = mock_livekit_client.room.update_participant.call_args
    assert call_kwargs[0][0].identity == "anon-participant-id"


# ---
# rename
# ---


def test_rename_participant_success(mock_livekit_client, room, token):
    """Test successfully renaming a participant."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    response = client.post(url, {"name": "John Doe", "token": token}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.update_participant.assert_called_once()
    mock_livekit_client.aclose.assert_called_once()


def test_rename_participant_sets_correct_name(mock_livekit_client, room, token):
    """Test that rename passes the correct name to LiveKit."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    client.post(url, {"name": "Jane Doe", "token": token}, format="json")

    call_kwargs = mock_livekit_client.room.update_participant.call_args
    assert call_kwargs[0][0].name == "Jane Doe"


def test_rename_participant_uses_identity_from_token(
    mock_livekit_client, room, token, user
):
    """Test that rename derives participant identity from the LiveKit token, not the request."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    client.post(url, {"name": "John Doe", "token": token}, format="json")

    call_kwargs = mock_livekit_client.room.update_participant.call_args
    assert call_kwargs[0][0].identity == str(user.sub)


def test_rename_participant_empty_name(room, token):
    """Test rename with an empty name returns 400."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    response = client.post(url, {"name": "", "token": token}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "name" in response.data


def test_rename_participant_missing_name(room, token):
    """Test rename with missing name field returns 400."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    response = client.post(url, {"token": token}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "name" in response.data


def test_rename_participant_name_too_long(room, token):
    """Test rename with a name exceeding 255 characters returns 400."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    response = client.post(url, {"name": "a" * 256, "token": token}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "name" in response.data


def test_rename_participant_forbidden_without_token(room):
    """Test rename returns 403 when no LiveKit token is provided."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    response = client.post(url, {"name": "John Doe"}, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_rename_participant_forbidden_token_for_wrong_room(user):
    """Test rename returns 403 when the token is scoped to a different room."""
    wrong_room = RoomFactory()
    target_room = RoomFactory()
    wrong_token = utils.generate_token(room=str(wrong_room.id), user=user)

    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": target_room.id})
    response = client.post(
        url, {"name": "John Doe", "token": wrong_token}, format="json"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_rename_participant_unexpected_twirp_error(mock_livekit_client, room, token):
    """Test rename when LiveKit API raises TwirpError."""
    mock_livekit_client.room.update_participant.side_effect = TwirpError(
        msg="Internal server error", code="unknown", status=500
    )

    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    response = client.post(url, {"name": "John Doe", "token": token}, format="json")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data == {"error": "Failed to rename participant"}

    mock_livekit_client.aclose.assert_called_once()


def test_rename_participant_success_anonymous(
    mock_livekit_client, room, anonymous_token
):
    """Test successfully renaming an anonymous participant."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    response = client.post(
        url, {"name": "Guest User", "token": anonymous_token}, format="json"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.update_participant.assert_called_once()
    mock_livekit_client.aclose.assert_called_once()


def test_rename_participant_uses_identity_from_token_anonymous(
    mock_livekit_client, room, anonymous_token
):
    """Test that rename derives identity from participant_id for anonymous users."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    client.post(url, {"name": "Guest User", "token": anonymous_token}, format="json")

    call_kwargs = mock_livekit_client.room.update_participant.call_args
    assert call_kwargs[0][0].identity == "anon-participant-id"


def test_rename_participant_sets_correct_name_anonymous(
    mock_livekit_client, room, anonymous_token
):
    """Test that rename passes the correct name to LiveKit for anonymous users."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    client.post(url, {"name": "Guest User", "token": anonymous_token}, format="json")

    call_kwargs = mock_livekit_client.room.update_participant.call_args
    assert call_kwargs[0][0].name == "Guest User"


def test_rename_participant_forbidden_anonymous_token_for_wrong_room(anonymous_token):
    """Test rename returns 403 when anonymous token is scoped to a different room."""
    target_room = RoomFactory()

    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": target_room.id})
    response = client.post(
        url, {"name": "Guest User", "token": anonymous_token}, format="json"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


# ---
# expired / malformed / missing room — shared cases
# ---


@pytest.fixture
@freeze_time("2023-01-15 12:00:00")
def expired_token(room, user):
    """Generate a LiveKit JWT frozen in the past, guaranteed to be expired."""
    return utils.generate_token(room=str(room.id), user=user)


def test_toggle_hand_expired_token(room, expired_token):
    """Test toggle hand returns 403 when the LiveKit token is expired."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(url, {"raised": True, "token": expired_token}, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_rename_participant_expired_token(room, expired_token):
    """Test rename returns 403 when the LiveKit token is expired."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    response = client.post(
        url, {"name": "John Doe", "token": expired_token}, format="json"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_toggle_hand_malformed_token(room):
    """Test toggle hand returns 403 when the LiveKit token is malformed."""
    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(
        url, {"raised": True, "token": "this-is-not-a-valid-jwt"}, format="json"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_toggle_hand_room_not_found(user):
    """Test toggle hand returns 404 when the room does not exist."""
    non_existent_room_id = uuid4()
    token = utils.generate_token(room=str(non_existent_room_id), user=user)

    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": non_existent_room_id})
    response = client.post(url, {"raised": True, "token": token}, format="json")

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_toggle_hand_participant_not_found(mock_livekit_client, room, token):
    """Test toggle hand returns 404 when the participant no longer exists in the room."""
    mock_livekit_client.room.update_participant.side_effect = TwirpError(
        msg="participant does not exist", code="not_found", status=404
    )

    client = APIClient()
    url = reverse("rooms-toggle-hand", kwargs={"pk": room.id})
    response = client.post(url, {"raised": True, "token": token}, format="json")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data == {"error": "Participant not found"}

    mock_livekit_client.aclose.assert_called_once()


def test_rename_participant_malformed_token(room):
    """Test rename returns 403 when the LiveKit token is malformed."""
    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    response = client.post(
        url, {"name": "John Doe", "token": "this-is-not-a-valid-jwt"}, format="json"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_rename_participant_room_not_found(user):
    """Test rename returns 404 when the room does not exist."""
    non_existent_room_id = uuid4()
    token = utils.generate_token(room=str(non_existent_room_id), user=user)

    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": non_existent_room_id})
    response = client.post(url, {"name": "John Doe", "token": token}, format="json")

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_rename_participant_not_found(mock_livekit_client, room, token):
    """Test rename returns 404 when the participant no longer exists in the room."""
    mock_livekit_client.room.update_participant.side_effect = TwirpError(
        msg="participant does not exist", code="not_found", status=404
    )

    client = APIClient()
    url = reverse("rooms-rename", kwargs={"pk": room.id})
    response = client.post(url, {"name": "John Doe", "token": token}, format="json")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data == {"error": "Participant not found"}

    mock_livekit_client.aclose.assert_called_once()
