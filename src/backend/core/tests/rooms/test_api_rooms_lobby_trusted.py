"""Trusted rooms: any authenticated participant present in the meeting can manage the lobby."""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from core.factories import RoomFactory, UserFactory
from core.models import RoomAccessLevel
from core.services.presence import PresenceCache

pytestmark = pytest.mark.django_db


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_trusted_room_present_user_can_list_waiting(mock_check):
    """Authenticated + present in a trusted room -> 200, LiveKit asked once then cached."""
    mock_check.return_value = True
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    client = APIClient()
    client.force_login(user)

    url = f"/api/v1.0/rooms/{room.id}/waiting-participants/"
    assert client.get(url).status_code == 200
    assert client.get(url).status_code == 200
    assert mock_check.call_count == 1


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_trusted_room_absent_user_forbidden(mock_check):
    """Authenticated but not connected to the meeting -> 403."""
    mock_check.return_value = False
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")
    assert response.status_code == 403


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_restricted_room_present_user_forbidden(mock_check):
    """Presence is not enough on a restricted room; LiveKit must not even be asked."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")
    assert response.status_code == 403
    mock_check.assert_not_called()


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_trusted_room_presence_cleared_after_leave(mock_check):
    """Once the presence cache is cleared (participant_left), LiveKit is re-checked."""
    mock_check.return_value = True
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    client = APIClient()
    client.force_login(user)
    url = f"/api/v1.0/rooms/{room.id}/waiting-participants/"

    assert client.get(url).status_code == 200
    PresenceCache().clear(room.id, str(user.sub))

    mock_check.return_value = False
    assert client.get(url).status_code == 403
    assert mock_check.call_count == 2


def test_trusted_room_anonymous_forbidden():
    """Anonymous users never manage the lobby."""
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    response = APIClient().get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")
    assert response.status_code == 401


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_trusted_room_present_user_can_accept_entry(mock_check):
    """Authenticated + present in a trusted room can accept a waiting participant."""
    mock_check.return_value = True
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": "2f7f162f-e7d1-421b-90e7-02bfbfbf8def", "allow_entry": True},
    )
    # Permission passed; 404 because that participant isn't actually waiting.
    assert response.status_code == 404
    assert response.json() == {"message": "Participant not found."}
