"""
Test rooms API endpoints in the Meet core app: demote participant from owner.
"""

# pylint: disable=redefined-outer-name,unused-argument

from unittest import mock

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


def test_demote_participant_unauthenticated():
    """Test demote participant returns 401 when not authenticated."""
    client = APIClient()
    room = RoomFactory()

    url = reverse("rooms-demote-participant", kwargs={"pk": room.id})
    response = client.post(url, {"participant_identity": "test-user"}, format="json")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_demote_participant_forbidden_non_owner():
    """Test demote participant returns 403 when user is admin but not owner."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    admin = UserFactory()
    target_owner = UserFactory(sub="target-owner-sub")

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    UserResourceAccessFactory(resource=room, user=target_owner, role="owner")
    # Create admin access for the requesting user
    UserResourceAccessFactory(resource=room, user=admin, role="administrator")

    client.force_authenticate(user=admin)

    url = reverse("rooms-demote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": target_owner.sub}, format="json"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_demote_participant_forbidden_member():
    """Test demote participant returns 403 when user is just a member."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    member = UserFactory()
    target_owner = UserFactory(sub="target-owner-sub")

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    UserResourceAccessFactory(resource=room, user=target_owner, role="owner")
    # Create member access for the requesting user
    UserResourceAccessFactory(resource=room, user=member, role="member")

    client.force_authenticate(user=member)

    url = reverse("rooms-demote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": target_owner.sub}, format="json"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_demote_participant_success(mock_livekit_client):
    """Test owner can successfully demote another owner."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    target_owner = UserFactory(sub="target-owner-sub")

    # Create owner accesses - need at least 2 owners
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    UserResourceAccessFactory(resource=room, user=target_owner, role="owner")

    client.force_authenticate(user=owner)

    url = reverse("rooms-demote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": target_owner.sub}, format="json"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == "success"

    # Verify ResourceAccess was deleted
    assert not ResourceAccess.objects.filter(
        resource=room, user=target_owner, role=RoleChoices.OWNER
    ).exists()

    # Verify LiveKit update was called
    mock_livekit_client.room.update_participant.assert_called_once()
    # aclose called twice: once for participant update, once for notification
    assert mock_livekit_client.aclose.call_count == 2


def test_demote_participant_cannot_demote_last_owner():
    """Test cannot demote the last owner of a room."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory(sub="owner-sub")

    # Create only one owner
    UserResourceAccessFactory(resource=room, user=owner, role="owner")

    client.force_authenticate(user=owner)

    url = reverse("rooms-demote-participant", kwargs={"pk": room.id})
    response = client.post(url, {"participant_identity": owner.sub}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Cannot demote the last owner" in str(response.data)

    # Verify owner access still exists
    assert ResourceAccess.objects.filter(
        resource=room, user=owner, role=RoleChoices.OWNER
    ).exists()


def test_demote_participant_not_an_owner():
    """Test demoting a non-owner returns error."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    member = UserFactory(sub="member-sub")

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    # Target is a member, not an owner
    UserResourceAccessFactory(resource=room, user=member, role="member")

    client.force_authenticate(user=owner)

    url = reverse("rooms-demote-participant", kwargs={"pk": room.id})
    response = client.post(url, {"participant_identity": member.sub}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "User is not an owner" in str(response.data)


def test_demote_participant_user_not_found():
    """Test demoting non-existent user fails."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")

    client.force_authenticate(user=owner)

    url = reverse("rooms-demote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": "non-existent-user-sub"}, format="json"
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "No user found" in str(response.data)


def test_demote_participant_no_access():
    """Test demoting user with no access to room."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    unrelated_user = UserFactory(sub="unrelated-user-sub")

    # Create owner access
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    # unrelated_user has no access to room

    client.force_authenticate(user=owner)

    url = reverse("rooms-demote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": unrelated_user.sub}, format="json"
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "User is not an owner" in str(response.data)


def test_demote_participant_livekit_error_still_succeeds(mock_livekit_client):
    """Test that database changes persist even if LiveKit update fails."""
    client = APIClient()
    room = RoomFactory()
    owner = UserFactory()
    target_owner = UserFactory(sub="target-owner-sub")

    # Create owner accesses - need at least 2 owners
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    UserResourceAccessFactory(resource=room, user=target_owner, role="owner")

    # Make LiveKit fail
    mock_livekit_client.room.update_participant.side_effect = TwirpError(
        msg="Internal server error", code=500, status=500
    )

    client.force_authenticate(user=owner)

    url = reverse("rooms-demote-participant", kwargs={"pk": room.id})
    response = client.post(
        url, {"participant_identity": target_owner.sub}, format="json"
    )

    # Should still succeed - database update worked
    assert response.status_code == status.HTTP_200_OK

    # Verify ResourceAccess was deleted despite LiveKit failure
    assert not ResourceAccess.objects.filter(
        resource=room, user=target_owner, role=RoleChoices.OWNER
    ).exists()


def test_demote_participant_owner_can_demote_self_if_not_last(mock_livekit_client):
    """Test owner can demote themselves if not the last owner."""
    client = APIClient()
    room = RoomFactory()
    owner1 = UserFactory(sub="owner1-sub")
    owner2 = UserFactory(sub="owner2-sub")

    # Create two owner accesses
    UserResourceAccessFactory(resource=room, user=owner1, role="owner")
    UserResourceAccessFactory(resource=room, user=owner2, role="owner")

    client.force_authenticate(user=owner1)

    url = reverse("rooms-demote-participant", kwargs={"pk": room.id})
    response = client.post(url, {"participant_identity": owner1.sub}, format="json")

    assert response.status_code == status.HTTP_200_OK

    # Verify owner1's access was deleted
    assert not ResourceAccess.objects.filter(
        resource=room, user=owner1, role=RoleChoices.OWNER
    ).exists()

    # Verify owner2 is still owner
    assert ResourceAccess.objects.filter(
        resource=room, user=owner2, role=RoleChoices.OWNER
    ).exists()
