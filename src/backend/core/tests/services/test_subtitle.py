"""
Test subtitle service.
"""

# pylint: disable=W0621
from unittest import mock

import pytest

from core.factories import RoomFactory
from core.services.subtitle import SubtitleService

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_livekit_client():
    """Mock LiveKit API client."""
    with mock.patch("core.utils.create_livekit_client") as mock_create:
        mock_client = mock.AsyncMock()
        mock_create.return_value = mock_client
        yield mock_client


def test_start_subtitle_settings(mock_livekit_client, settings):
    """Test that start_subtitle uses the configured agent name from Django settings."""

    settings.ROOM_SUBTITLE_AGENT_NAME = "fake-subtitle-agent-name"

    room = RoomFactory(name="my room")
    SubtitleService().start_subtitle(room)

    mock_livekit_client.agent_dispatch.create_dispatch.assert_called_once()

    call_args = mock_livekit_client.agent_dispatch.create_dispatch.call_args[0][0]
    assert call_args.agent_name == "fake-subtitle-agent-name"
    assert call_args.room == str(room.id)


def test_stop_subtitle_not_implemented():
    """Test that stop_subtitle raises NotImplementedError."""

    room = RoomFactory(name="my room")

    with pytest.raises(
        NotImplementedError, match="Subtitle agent stopping not yet implemented"
    ):
        SubtitleService().stop_subtitle(room)
