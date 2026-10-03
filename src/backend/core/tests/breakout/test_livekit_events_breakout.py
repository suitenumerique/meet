"""
Test that a meeting ending closes its breakout session.
"""
# pylint: disable=W0621,W0613,W0212

from unittest import mock

from django.test import override_settings

import pytest
from rest_framework.test import APIClient

from core.factories import RoomFactory, UserFactory, UserResourceAccessFactory
from core.models import BreakoutRoom, BreakoutSession, BreakoutSessionStatusChoices
from core.services.livekit_events import ActionFailedError, LiveKitEventsService
from core.services.lobby import LobbyService
from core.services.sip_management import SIPException, SIPManagement

pytestmark = pytest.mark.django_db


@pytest.fixture
def service(settings):
    """A LiveKitEventsService with a test LiveKit configuration."""
    settings.LIVEKIT_CONFIGURATION = {
        "api_key": "test_api_key",
        "api_secret": "test_api_secret",
        "url": "https://test-livekit.example.com/",
    }
    return LiveKitEventsService()


def open_session(room):
    """Rows of an active session with two rooms."""
    session = BreakoutSession.objects.create(room=room)
    for index in range(2):
        BreakoutRoom.objects.create(
            session=session, name=f"Room {index + 1}", position=index
        )
    return session


def finished(service, room):
    """Deliver the meeting's room_finished event."""
    data = mock.MagicMock()
    data.room.name = str(room.id)
    service._handle_room_finished(data)


@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_handle_room_finished_closes_breakout_session(
    mock_delete_dispatch_rule, mock_clear_cache, livekit, service
):
    """The meeting ending closes its split, and the next Open succeeds."""
    room = RoomFactory()
    owner = UserFactory()
    UserResourceAccessFactory(resource=room, user=owner, role="owner")
    session = open_session(room)

    finished(service, room)

    session.refresh_from_db()
    assert session.status == BreakoutSessionStatusChoices.CLOSED
    assert session.closed_at is not None
    mock_clear_cache.assert_called_once_with(room.id)
    # The meeting's metadata went with its room: nothing is written to it.
    livekit.room.update_room_metadata.assert_not_awaited()

    client = APIClient()
    client.force_login(owner)
    response = client.post(
        f"/api/v1.0/rooms/{room.id!s}/breakout-sessions/",
        {
            "rooms": [
                {"name": "A", "participants": [{"identity": "alice", "name": "Al"}]},
                {"name": "B", "participants": [{"identity": "bob", "name": "Bo"}]},
            ]
        },
        "json",
    )
    assert response.status_code == 201


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
def test_handle_room_started_closes_a_stale_breakout_session(
    mock_ensure_dispatch_rule, service
):
    """A split the meeting's last run left open closes when the meeting starts again."""
    room = RoomFactory()
    session = open_session(room)
    data = mock.MagicMock()
    data.room.name = str(room.id)

    service._handle_room_started(data)

    session.refresh_from_db()
    assert session.status == BreakoutSessionStatusChoices.CLOSED


@pytest.mark.parametrize("failing", ["sip", "lobby"])
@override_settings(ROOM_TELEPHONY_ENABLED=True)
@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_handle_room_finished_cleanup_fails_still_closes_breakout(
    mock_delete_dispatch_rule, mock_clear_cache, livekit, service, failing
):
    """A failed dispatch rule delete or lobby clear still closes the split."""
    if failing == "sip":
        mock_delete_dispatch_rule.side_effect = SIPException("boom")
    else:
        mock_clear_cache.side_effect = RuntimeError("boom")
    room = RoomFactory()
    session = open_session(room)

    with pytest.raises(ActionFailedError):
        finished(service, room)

    session.refresh_from_db()
    assert session.status == BreakoutSessionStatusChoices.CLOSED
