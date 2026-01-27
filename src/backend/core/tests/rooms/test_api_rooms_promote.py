"""
Test rooms API endpoints in the Meet core app: promote participant to owner.
"""

# pylint: disable=redefined-outer-name,unused-argument

from unittest import mock
from uuid import uuid4

from django.urls import reverse

import pytest
from livekit.api import TwirpError
from rest_framework import status
from rest_framework.test import APIClient

from core.factories import RoomFactory, UserFactory, UserResourceAccessFactory
from core.models import ResourceAccess, RoleChoices

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_livekit_client():
    """Mock LiveKit API client."""
    with mock.patch("core.utils.create_livekit_client") as mock_create:
        mock_client = mock.AsyncMock()
        mock_create.return_value = mock_client
        yield mock_client


def test_promote_participant_unauthenticated():
    """Test promote participant returns 401 when not authenticated."""
    client = APIClient()
    room = RoomFactory()

    url = reverse("rooms-promote-participant", kwargs={"pk": room.id})
    response = client.post(url, {"participant_identity": "test-user"}, format="json")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_promote_participant_forbidden_non_owner():
    """Test promote participant returns 403 when user is admin but not owner."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    admin = UserFactory()

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    # Create admin access for the requesting user
    UserResourceAccessFactory(resource=room, user=admin, role="administrator")

    client.force_authenticate(user=admin)

    target_user = UserFactory(sub="target-user-sub")
    url = reverse("rooms-promote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": target_user.sub}, format="json"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_promote_participant_forbidden_member():
    """Test promote participant returns 403 when user is just a member."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    member = UserFactory()

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    # Create member access for the requesting user
    UserResourceAccessFactory(resource=room, user=member, role="member")

    client.force_authenticate(user=member)

    target_user = UserFactory(sub="target-user-sub")
    url = reverse("rooms-promote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": target_user.sub}, format="json"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_promote_participant_success(mock_livekit_client):
    """Test owner can successfully promote a participant to owner."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    target_user = UserFactory(sub="target-user-sub")

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")

    client.force_authenticate(user=owner)

    url = reverse("rooms-promote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": target_user.sub}, format="json"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == "success"
    assert response.data["created"] is True

    # Verify ResourceAccess was created
    access = ResourceAccess.objects.get(resource=room, user=target_user)
    assert access.role == RoleChoices.OWNER

    # Verify LiveKit update was called
    mock_livekit_client.room.update_participant.assert_called_once()
    # aclose called twice: once for participant update, once for notification
    assert mock_livekit_client.aclose.call_count == 2


def test_promote_participant_already_owner(mock_livekit_client):
    """Test promoting already-owner is idempotent."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    target_user = UserFactory(sub="target-user-sub")

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    # Target is already an owner
    UserResourceAccessFactory(resource=room, user=target_user, role="owner")

    client.force_authenticate(user=owner)

    url = reverse("rooms-promote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": target_user.sub}, format="json"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == "success"
    assert response.data["created"] is False  # Not newly created

    # Verify still owner
    access = ResourceAccess.objects.get(resource=room, user=target_user)
    assert access.role == RoleChoices.OWNER


def test_promote_participant_anonymous_fails():
    """Test promoting anonymous participant (UUID identity) fails."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")

    client.force_authenticate(user=owner)

    # UUID identity indicates anonymous user
    anonymous_identity = str(uuid4())
    url = reverse("rooms-promote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": anonymous_identity}, format="json"
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Anonymous participants cannot be promoted" in str(response.data)


def test_promote_participant_user_not_found():
    """Test promoting non-existent user fails."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")

    client.force_authenticate(user=owner)

    url = reverse("rooms-promote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": "non-existent-user-sub"}, format="json"
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "No user found" in str(response.data)


def test_promote_participant_upgrades_member_to_owner(mock_livekit_client):
    """Test promoting a member upgrades them to owner."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    target_user = UserFactory(sub="target-user-sub")

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    # Target is a member
    UserResourceAccessFactory(resource=room, user=target_user, role="member")

    client.force_authenticate(user=owner)

    url = reverse("rooms-promote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": target_user.sub}, format="json"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == "success"
    assert response.data["created"] is False  # Updated, not created

    # Verify upgraded to owner
    access = ResourceAccess.objects.get(resource=room, user=target_user)
    assert access.role == RoleChoices.OWNER


def test_promote_participant_livekit_error_still_succeeds(mock_livekit_client):
    """Test that database changes persist even if LiveKit update fails."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    target_user = UserFactory(sub="target-user-sub")

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")

    # Make LiveKit fail
    mock_livekit_client.room.update_participant.side_effect = TwirpError(
        msg="Internal server error", code=500, status=500
    )

    client.force_authenticate(user=owner)

    url = reverse("rooms-promote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": target_user.sub}, format="json"
    )

    # Should still succeed - database update worked
    assert response.status_code == status.HTTP_200_OK

    # Verify ResourceAccess was created despite LiveKit failure
    access = ResourceAccess.objects.get(resource=room, user=target_user)
    assert access.role == RoleChoices.OWNER
