"""Trusted and public rooms: any authenticated participant present in the meeting can record."""

# pylint: disable=redefined-outer-name,unused-argument,protected-access

from unittest import mock

import pytest
from rest_framework.test import APIClient

from core.factories import RecordingFactory, RoomFactory, UserFactory
from core.models import (
    Recording,
    RecordingStatusChoices,
    RoleChoices,
    RoomAccessLevel,
)
from core.recording.event.notification import NotificationService
from core.services.presence import PresenceCache

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_worker_manager():
    """Mock the worker service factory and mediator."""
    with (
        mock.patch("core.api.viewsets.get_worker_service"),
        mock.patch("core.api.viewsets.WorkerServiceMediator") as mediator_class,
    ):
        mediator = mock.Mock()
        mediator_class.return_value = mediator
        yield mediator


@pytest.fixture(autouse=True)
def enable_recording(settings):
    """Recording must be enabled for the endpoints to be reachable."""
    settings.RECORDING_ENABLE = True


@pytest.mark.parametrize(
    "access_level", [RoomAccessLevel.TRUSTED, RoomAccessLevel.PUBLIC]
)
@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=True,
)
def test_open_room_present_user_can_start_recording(
    mock_check, access_level, mock_worker_manager
):
    """Authenticated + present in a trusted/public room -> 201, starter owns it."""
    user = UserFactory()
    room = RoomFactory(access_level=access_level)

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/", {"mode": "screen_recording"}
    )

    assert response.status_code == 201
    mock_check.assert_called_once_with(room_name=str(room.id), identity=str(user.sub))
    recording = Recording.objects.get()
    mock_worker_manager.start.assert_called_once_with(recording)
    access = recording.accesses.get()
    assert access.user == user
    assert access.role == RoleChoices.OWNER


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=True,
)
def test_presence_is_cached_until_participant_leaves(mock_check, mock_worker_manager):
    """Presence is memoized like for the lobby; clearing it forces a LiveKit re-check."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    RecordingFactory(room=room, status=RecordingStatusChoices.ACTIVE)

    client = APIClient()
    client.force_login(user)

    url = f"/api/v1.0/rooms/{room.id}/stop-recording/"

    assert client.post(url).status_code == 200
    assert client.post(url).status_code == 200
    assert mock_check.call_count == 1

    # participant_left webhook
    PresenceCache().clear(room.id, str(user.sub))
    mock_check.return_value = False

    assert client.post(url).status_code == 403
    assert mock_check.call_count == 2


@pytest.mark.parametrize(
    "access_level", [RoomAccessLevel.TRUSTED, RoomAccessLevel.PUBLIC]
)
@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=False,
)
def test_open_room_absent_user_forbidden(mock_check, access_level, mock_worker_manager):
    """Authenticated but not connected to the meeting -> 403."""
    room = RoomFactory(access_level=access_level)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/", {"mode": "screen_recording"}
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "You are not allowed to perform this action."}
    assert Recording.objects.count() == 0


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=True,
)
def test_restricted_room_present_user_forbidden(mock_check, mock_worker_manager):
    """Presence is not enough on restricted rooms; LiveKit is not even asked."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/", {"mode": "screen_recording"}
    )

    assert response.status_code == 403
    mock_check.assert_not_called()
    assert Recording.objects.count() == 0


@pytest.mark.parametrize(
    "access_level", [RoomAccessLevel.TRUSTED, RoomAccessLevel.PUBLIC]
)
@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=True,
)
def test_open_room_present_user_can_stop_recording(
    mock_check, access_level, mock_worker_manager
):
    """Any present authenticated user can stop the active recording."""
    room = RoomFactory(access_level=access_level)
    recording = RecordingFactory(room=room, status=RecordingStatusChoices.ACTIVE)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)
    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == 200
    mock_worker_manager.stop.assert_called_once_with(recording)


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_admin_does_not_need_presence(mock_check, mock_worker_manager):
    """Admins/owners keep recording rights on any room, without a LiveKit check."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    room.accesses.create(user=user, role=RoleChoices.ADMIN)
    client = APIClient()
    client.force_login(user)
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/", {"mode": "screen_recording"}
    )

    assert response.status_code == 201
    mock_check.assert_not_called()


@pytest.mark.parametrize(
    "access_level", [RoomAccessLevel.TRUSTED, RoomAccessLevel.PUBLIC]
)
def test_open_room_anonymous_forbidden(access_level):
    """Anonymous users never record, even on public rooms."""
    room = RoomFactory(access_level=access_level)
    response = APIClient().post(
        f"/api/v1.0/rooms/{room.id}/start-recording/", {"mode": "screen_recording"}
    )
    assert response.status_code == 401


@pytest.mark.parametrize(
    "access_level", [RoomAccessLevel.TRUSTED, RoomAccessLevel.PUBLIC]
)
@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=True,
)
def test_participant_path_disabled_by_setting(
    mock_check, access_level, settings, mock_worker_manager
):
    """Self-hosters can opt out: participants then get 403, LiveKit not asked."""
    settings.RECORDING_AUTHENTICATED_PARTICIPANTS_ENABLED = False
    room = RoomFactory(access_level=access_level)
    RecordingFactory(room=room, status=RecordingStatusChoices.ACTIVE)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    start = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/", {"mode": "screen_recording"}
    )
    stop = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert start.status_code == 403
    assert stop.status_code == 403
    mock_check.assert_not_called()
    mock_worker_manager.start.assert_not_called()
    mock_worker_manager.stop.assert_not_called()


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_participant_path_disabled_admin_still_records(
    mock_check, settings, mock_worker_manager
):
    """The setting only removes the participant path, never admin rights."""
    settings.RECORDING_AUTHENTICATED_PARTICIPANTS_ENABLED = False
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    room.accesses.create(user=user, role=RoleChoices.OWNER)
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/", {"mode": "screen_recording"}
    )

    assert response.status_code == 201
    mock_check.assert_not_called()


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=True,
)
def test_lobby_not_affected_by_recording_setting(mock_check, settings):
    """The recording opt-out must not leak into the lobby capability."""
    settings.RECORDING_AUTHENTICATED_PARTICIPANTS_ENABLED = False
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)
    response = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")

    assert response.status_code == 200


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=True,
)
def test_public_room_lobby_is_open_but_empty(mock_check):
    """Participants pass the lobby permission on public rooms, which have no lobby."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    listing = client.get(f"/api/v1.0/rooms/{room.id}/waiting-participants/")
    entry = client.post(
        f"/api/v1.0/rooms/{room.id}/enter/",
        {"participant_id": "2f7f162f-e7d1-421b-90e7-02bfbfbf8def", "allow_entry": True},
    )

    assert listing.status_code == 200
    assert listing.json() == {"participants": []}
    assert entry.status_code == 404
    assert entry.json() == {"message": "Room has no lobby system."}


@pytest.mark.parametrize("enabled", [True, False])
def test_config_exposes_authenticated_participants_setting(settings, enabled):
    """The frontend reads the setting from /config/ to gate the UI."""
    settings.RECORDING_AUTHENTICATED_PARTICIPANTS_ENABLED = enabled

    response = APIClient().get("/api/v1.0/config/")

    assert response.status_code == 200
    assert response.json()["recording"]["authenticated_participants_enabled"] is enabled


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=True,
)
def test_room_owners_and_admins_get_access_to_participant_recording(
    mock_check, mock_worker_manager
):
    """Starter and room owners/admins all own the recording; members get nothing."""
    starter = UserFactory()
    room_owner = UserFactory()
    room_admin = UserFactory()
    room_member = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    room.accesses.create(user=room_owner, role=RoleChoices.OWNER)
    room.accesses.create(user=room_admin, role=RoleChoices.ADMIN)
    room.accesses.create(user=room_member, role=RoleChoices.MEMBER)
    client = APIClient()
    client.force_login(starter)
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/", {"mode": "screen_recording"}
    )

    assert response.status_code == 201
    recording = Recording.objects.get()
    assert dict(recording.accesses.values_list("user_id", "role")) == {
        starter.id: RoleChoices.OWNER,
        room_owner.id: RoleChoices.OWNER,
        room_admin.id: RoleChoices.OWNER,
    }

    # Room admins can see and download it; plain members cannot.
    client.force_login(room_admin)
    assert client.get(f"/api/v1.0/recordings/{recording.id}/").status_code == 200
    client.force_login(room_member)
    assert client.get(f"/api/v1.0/recordings/{recording.id}/").status_code == 404


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_room_admin_starter_is_not_duplicated(mock_check, mock_worker_manager):
    """A room admin who starts the recording gets a single access."""
    starter = UserFactory()
    co_owner = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    room.accesses.create(user=starter, role=RoleChoices.ADMIN)
    room.accesses.create(user=co_owner, role=RoleChoices.OWNER)
    client = APIClient()
    client.force_login(starter)
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/", {"mode": "screen_recording"}
    )

    assert response.status_code == 201
    recording = Recording.objects.get()
    assert dict(recording.accesses.values_list("user_id", "role")) == {
        starter.id: RoleChoices.OWNER,
        co_owner.id: RoleChoices.OWNER,
    }


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=True,
)
def test_participant_can_stop_recording_started_by_someone_else(
    mock_check, mock_worker_manager
):
    """Stopping is room-wide on trusted rooms, not tied to who started it."""
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    recording = RecordingFactory(room=room, status=RecordingStatusChoices.ACTIVE)
    recording.accesses.create(user=UserFactory(), role=RoleChoices.OWNER)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")

    assert response.status_code == 200
    mock_worker_manager.stop.assert_called_once_with(recording)


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting",
    return_value=True,
)
def test_summary_goes_to_starter_among_several_owners(mock_check, mock_worker_manager):
    """The starter's access is created first, so the summary goes to them."""
    starter = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    for _ in range(2):
        room.accesses.create(user=UserFactory(), role=RoleChoices.OWNER)
    client = APIClient()
    client.force_login(starter)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/", {"mode": "transcript"}
    )

    assert response.status_code == 201
    recording = Recording.objects.get()
    assert recording.accesses.count() == 3
    assert NotificationService._get_summary_recipient(recording) == starter
