"""
Test rooms API endpoints in the Meet core app: participants management.
"""

# pylint: disable=redefined-outer-name,unused-argument,protected-access,no-name-in-module

import random
from unittest import mock
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import SuspiciousOperation
from django.urls import reverse

import pytest
from livekit.api import TwirpError, UpdateParticipantRequest
from rest_framework import status
from rest_framework.test import APIClient

from core import utils
from core.factories import RoomFactory, UserFactory, UserResourceAccessFactory
from core.services.lobby import LobbyService

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_livekit_client():
    """Mock LiveKit API client."""
    with mock.patch("core.utils.create_livekit_client") as mock_create:
        mock_client = mock.AsyncMock()
        mock_create.return_value = mock_client
        yield mock_client


def test_mute_participant_success_as_admin(mock_livekit_client):
    """Admins and owners should be able to mute without a LiveKit token."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.mute_published_track.assert_called_once()
    mock_livekit_client.aclose.assert_called_once()


def test_mute_participant_anonymous_no_token_forbidden(mock_livekit_client):
    """Should forbid muting when user is anonymous and no LiveKit token."""
    client = APIClient()
    room = RoomFactory()

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    mock_livekit_client.room.mute_published_track.assert_not_called()


def test_mute_participant_with_livekit_token_for_this_room(mock_livekit_client):
    """Should allow muting when the LiveKit token is scoped to this room."""
    client = APIClient()
    room = RoomFactory()

    user = AnonymousUser()
    token = utils.generate_token(str(room.id), user, is_admin_or_owner=False)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.mute_published_track.assert_called_once()


def test_mute_participant_with_livekit_token_for_another_room_forbidden(
    mock_livekit_client,
):
    """Should forbid muting when the LiveKit token is scoped to a different room."""

    client = APIClient()
    target_room = RoomFactory()
    other_room = RoomFactory()

    user = AnonymousUser()
    token = utils.generate_token(str(other_room.id), user, is_admin_or_owner=False)

    url = reverse("rooms-mute-participant", kwargs={"pk": target_room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    mock_livekit_client.room.mute_published_track.assert_not_called()


def test_mute_participant_authenticated_no_role_no_token_forbidden(mock_livekit_client):
    """Should forbid muting when user has no room role and no LiveKit token."""
    client = APIClient()
    room = RoomFactory()  # everyone_can_mute defaults to True
    user = UserFactory()  # no UserResourceAccess for this room
    client.force_authenticate(user=user)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    mock_livekit_client.room.mute_published_track.assert_not_called()


def test_mute_participant_everyone_can_mute_disabled_blocks_non_admin(
    mock_livekit_client,
):
    """Should forbid muting when everyone_can_mute is False, even with a LiveKit token."""
    client = APIClient()
    room = RoomFactory(configuration={"everyone_can_mute": False})

    user = AnonymousUser()
    token = utils.generate_token(str(room.id), user, is_admin_or_owner=False)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    mock_livekit_client.room.mute_published_track.assert_not_called()


def test_mute_participant_everyone_can_mute_disabled_allows_admin(mock_livekit_client):
    """Should allow admins and owners to mute when everyone_can_mute is False."""
    client = APIClient()
    room = RoomFactory(configuration={"everyone_can_mute": False})
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    mock_livekit_client.room.mute_published_track.assert_called_once()


def test_mute_participant_invalid_payload():
    """Should reject muting when the payload is invalid."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": "invalid-uuid", "track_sid": ""}, format="json"
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_mute_participant_unexpected_twirp_error(mock_livekit_client):
    """Should return 500 when the LiveKit API raises a TwirpError."""
    client = APIClient()

    mock_livekit_client.room.mute_published_track.side_effect = TwirpError(
        msg="Internal server error", code="unknown", status=500
    )

    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data == {"error": "Failed to mute participant"}

    mock_livekit_client.aclose.assert_called_once()


def test_mute_participant_participant_not_found(mock_livekit_client):
    """Should return 404 when the participant does not exist in the room."""
    client = APIClient()

    mock_livekit_client.room.mute_published_track.side_effect = TwirpError(
        msg="participant does not exist", code="not_found", status=404
    )

    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data == {"error": "Participant not found"}

    mock_livekit_client.aclose.assert_called_once()


def test_mute_participant_management_exception(mock_livekit_client):
    """Should return 500 when ParticipantsManagement raises an unexpected error."""
    client = APIClient()

    mock_livekit_client.room.mute_published_track.side_effect = TwirpError(
        msg="boom", code="internal", status=503
    )

    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data == {"error": "Failed to mute participant"}

    mock_livekit_client.aclose.assert_called_once()


def test_mute_participant_admin_with_token_for_this_room(mock_livekit_client):
    """Should allow muting when user is admin and LiveKit token is scoped to this room."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    # Token identity matches the admin user so LiveKitTokenAuthentication
    # resolves request.user back to the admin.
    token = utils.generate_token(str(room.id), user, is_admin_or_owner=True)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.mute_published_track.assert_called_once()


def test_mute_participant_admin_with_token_for_another_room(mock_livekit_client):
    """Should not allow muting when user is admin and the LiveKit token is for another room."""
    client = APIClient()
    target_room = RoomFactory()
    other_room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=target_room,
        user=user,
        role=random.choice(["administrator", "owner"]),
    )
    # Token is scoped to a DIFFERENT room, and admin status must only be
    # honored when established via session, never via a LiveKit
    # token, which can be replayed off-host.
    token = utils.generate_token(str(other_room.id), user, is_admin_or_owner=True)

    url = reverse("rooms-mute-participant", kwargs={"pk": target_room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data == {
        "detail": "You do not have permission to perform this action."
    }

    mock_livekit_client.room.mute_published_track.assert_not_called()


def test_mute_participant_admin_token_replayed_does_not_grant_admin(
    mock_livekit_client,
):
    """Should forbid muting when a LiveKit token issued for an admin is passed without a session."""
    client = APIClient()
    room = RoomFactory(configuration={"everyone_can_mute": False})
    admin_user = UserFactory()
    UserResourceAccessFactory(
        resource=room,
        user=admin_user,
        role=random.choice(["administrator", "owner"]),
    )
    # The token is the only credential.
    token = utils.generate_token(str(room.id), admin_user, is_admin_or_owner=True)

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(
        url,
        {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    mock_livekit_client.room.mute_published_track.assert_not_called()


def test_update_participant_success(mock_livekit_client):
    """Test successful participant update."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {
        "participant_identity": str(uuid4()),
        "metadata": {"role": "presenter"},
        "permission": {
            "can_subscribe": True,
            "can_publish": True,
            "can_publish_data": True,
            "can_publish_sources": [
                "camera",
                "microphone",
            ],
            "can_update_metadata": True,
            "can_subscribe_metrics": True,
        },
        "name": "John Doe",
    }

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.update_participant.assert_called_once()
    mock_livekit_client.aclose.assert_called_once()


@pytest.mark.parametrize(
    "permission_payload",
    [
        {},  # empty dict is valid
        {"can_subscribe": True},
        {"can_publish": True},
        {"can_publish_data": True},
        {
            "can_publish_sources": [
                "camera",
                "microphone",
            ]
        },
        {"can_update_metadata": True},
        {"can_subscribe_metrics": False},
    ],
)
def test_update_participant_permission_fields_are_optional(
    mock_livekit_client, permission_payload
):
    """Test that each required permission field can be passed individually."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {
        "participant_identity": str(uuid4()),
        "permission": permission_payload,
    }

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.update_participant.assert_called_once()

    (request_arg,), _ = mock_livekit_client.room.update_participant.call_args
    assert isinstance(request_arg, UpdateParticipantRequest)

    mock_livekit_client.aclose.assert_called_once()


def test_update_participant_permission_fields_invalid_case(mock_livekit_client):
    """Should raise bad request when can_publish_sources is uppercase."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {
        "participant_identity": str(uuid4()),
        "permission": {
            "can_publish_sources": [
                "CAMERA",
                "microphone",
            ]
        },
    }

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    mock_livekit_client.room.update_participant.assert_not_called()
    mock_livekit_client.aclose.assert_not_called()


@pytest.mark.parametrize(
    "value,permission_key",
    [
        (False, "hidden"),
        (True, "hidden"),
        (False, "recorder"),
        (True, "recorder"),
        (False, "agent"),
        (True, "agent"),
    ],
)
@mock.patch("core.api.serializers.SuspiciousOperation", side_effect=SuspiciousOperation)
def test_update_participant_suspicious_permission(
    mock_suspicious, value, permission_key
):
    """Test update participant raises 400 when a restricted permission is set."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {
        "participant_identity": str(uuid4()),
        "permission": {
            "can_subscribe": True,
            "can_publish": True,
            "can_publish_data": True,
            "can_update_metadata": False,
            permission_key: value,
        },
    }

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    mock_suspicious.assert_called_once_with(
        f"Setting the following participant permissions is not allowed: {permission_key}."
    )


@mock.patch("core.api.serializers.SuspiciousOperation", side_effect=SuspiciousOperation)
def test_update_participant_suspicious_permission_multiple(mock_suspicious):
    """Test update participant raises 400 when multiple suspicious permissions are set."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {
        "participant_identity": str(uuid4()),
        "permission": {
            "can_subscribe": True,
            "can_publish": True,
            "can_publish_data": True,
            "hidden": True,
            "recorder": False,
            "can_update_metadata": False,
            "agent": True,
            "can_subscribe_metrics": False,
        },
    }

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    mock_suspicious.assert_called_once_with(
        "Setting the following participant permissions is not allowed: hidden, recorder, agent."
    )


def test_update_participant_forbidden_without_access():
    """Test update participant returns 403 when user lacks room privileges."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()  # User without UserResourceAccess
    client.force_authenticate(user=user)

    payload = {"participant_identity": str(uuid4()), "name": "Test User"}

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_update_participant_invalid_payload():
    """Test update participant with invalid payload."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {"participant_identity": "invalid-uuid"}

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Must be a valid UUID." in str(response.data)


def test_update_participant_no_update_fields():
    """Test update participant with no update fields provided."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {
        "participant_identity": str(uuid4())
        # No metadata, attributes, permission, or name
    }

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "At least one of the following fields must be provided" in str(response.data)


def test_update_participant_invalid_permission():
    """Test update participant with wrong permission object."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {
        "participant_identity": str(uuid4()),
        "permission": {"invalid-attributes": True},
    }

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "permission": [
            {
                "type": "extra_forbidden",
                "loc": ["invalid-attributes"],
                "msg": "Extra inputs are not permitted",
                "input": "True",
                "url": "https://errors.pydantic.dev/2.12/v/extra_forbidden",
            },
        ]
    }


def test_update_participant_wrong_metadata_attributes():
    """Test update participant with wrong metadata or attributes provided."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {
        "participant_identity": str(uuid4()),
        "metadata": "wrong string",
        "attributes": "wrong string",
    }

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "metadata" in response.data or "attributes" in response.data


def test_update_participant_unexpected_twirp_error(mock_livekit_client):
    """Test update participant when LiveKit API raises TwirpError."""
    client = APIClient()

    mock_livekit_client.room.update_participant.side_effect = TwirpError(
        msg="Internal server error", code="unknown", status=500
    )

    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {"participant_identity": str(uuid4()), "name": "Test User"}

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data == {"error": "Failed to update participant"}

    mock_livekit_client.aclose.assert_called_once()


def test_remove_participant_success_lobby_cache(mock_livekit_client):
    """Test successful participant removal.

    The lobby cache cleanup is crucial for security - without it, removed
    participants could potentially re-enter the room using their cached
    lobby session.
    """
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    participant_identity = str(uuid4())

    # Create participant in lobby cache first
    LobbyService().enter(room.id, participant_identity, "John doe")

    # Accept participant
    LobbyService().handle_participant_entry(room.id, participant_identity, True)

    payload = {"participant_identity": participant_identity}

    url = reverse("rooms-remove-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.remove_participant.assert_called_once()
    # called twice: once for Lobby, once for ParticipantManagement
    mock_livekit_client.aclose.assert_called()

    # Verify lobby cache was cleared - participant should no longer exist
    participant = LobbyService()._get_participant(room.id, participant_identity)
    assert participant is None


def test_remove_participant_success(mock_livekit_client):
    """Test successful participant removal."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {"participant_identity": str(uuid4())}

    url = reverse("rooms-remove-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.remove_participant.assert_called_once()
    mock_livekit_client.aclose.assert_called_once()


def test_remove_participant_forbidden_without_access():
    """Test remove participant returns 403 when user lacks room privileges."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()  # User without UserResourceAccess
    client.force_authenticate(user=user)

    payload = {"participant_identity": str(uuid4())}

    url = reverse("rooms-remove-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_remove_participant_invalid_payload():
    """Test remove participant with invalid payload."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {"participant_identity": "invalid-uuid"}

    url = reverse("rooms-remove-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_remove_participant_missing_identity():
    """Test remove participant with missing participant_identity."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {}  # Missing participant_identity

    url = reverse("rooms-remove-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_remove_participant_unexpected_twirp_error(mock_livekit_client):
    """Test remove participant when LiveKit API raises TwirpError."""
    client = APIClient()

    mock_livekit_client.room.remove_participant.side_effect = TwirpError(
        msg="Internal server error", code="unknown", status=500
    )

    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {"participant_identity": str(uuid4())}

    url = reverse("rooms-remove-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data == {"error": "Failed to remove participant"}

    mock_livekit_client.aclose.assert_called_once()


def test_update_participant_not_found(mock_livekit_client):
    """Test update participant returns 404 when the participant no longer exists in the room."""
    client = APIClient()

    mock_livekit_client.room.update_participant.side_effect = TwirpError(
        msg="participant does not exist", code="not_found", status=404
    )

    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {"participant_identity": str(uuid4()), "name": "Test User"}

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data == {"error": "Participant not found"}

    mock_livekit_client.aclose.assert_called_once()


def test_remove_participant_not_found(mock_livekit_client):
    """Test remove participant returns 404 when the participant no longer exists in the room."""
    client = APIClient()

    mock_livekit_client.room.remove_participant.side_effect = TwirpError(
        msg="participant does not exist", code="not_found", status=404
    )

    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {"participant_identity": str(uuid4())}

    url = reverse("rooms-remove-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data == {"error": "Participant not found"}

    mock_livekit_client.aclose.assert_called_once()
