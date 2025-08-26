"""
Test rooms API endpoints in the Meet core app: participants management.
"""

# pylint: disable=W0621,W0613, W0212

import random
from unittest import mock
from uuid import uuid4

from django.urls import reverse

import pytest
from livekit.api import TwirpError
from rest_framework import status
from rest_framework.test import APIClient

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


def test_mute_participant_success(mock_livekit_client):
    """Test successful participant muting."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"}

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.mute_published_track.assert_called_once()
    mock_livekit_client.aclose.assert_called_once()


def test_mute_participant_forbidden_without_access():
    """Test mute participant returns 403 when user lacks room privileges."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()  # User without UserResourceAccess
    client.force_authenticate(user=user)

    payload = {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"}

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_mute_participant_invalid_payload():
    """Test mute participant with invalid payload."""
    client = APIClient()
    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {"participant_identity": "invalid-uuid", "track_sid": ""}

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_mute_participant_unexpected_twirp_error(mock_livekit_client):
    """Test mute participant when LiveKit API raises TwirpError."""
    client = APIClient()

    mock_livekit_client.room.mute_published_track.side_effect = TwirpError(
        msg="Internal server error", code=500, status=500
    )

    room = RoomFactory()
    user = UserFactory()
    UserResourceAccessFactory(
        resource=room, user=user, role=random.choice(["administrator", "owner"])
    )
    client.force_authenticate(user=user)

    payload = {"participant_identity": str(uuid4()), "track_sid": "test-track-sid"}

    url = reverse("rooms-mute-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data == {"error": "Failed to mute participant"}

    mock_livekit_client.aclose.assert_called_once()


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
                1,
                2,
            ],  # [TrackSource.CAMERA, TrackSource.MICROPHONE]
            "hidden": False,
            "recorder": False,
            "can_update_metadata": True,
            "agent": False,
            "can_subscribe_metrics": False,
        },
        "name": "John Doe",
    }

    url = reverse("rooms-update-participant", kwargs={"pk": room.id})
    response = client.post(url, payload, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {"status": "success"}

    mock_livekit_client.room.update_participant.assert_called_once()
    mock_livekit_client.aclose.assert_called_once()


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
    assert "Invalid permission" in str(response.data)


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
        msg="Internal server error", code=500, status=500
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
        msg="Internal server error", code=500, status=500
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
