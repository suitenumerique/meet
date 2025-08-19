"""
Test rooms API endpoints in the Meet core app: start subtitle.
"""
# pylint: disable=W0621

import uuid
from unittest import mock

from django.conf import settings

import pytest
from livekit.api import AccessToken, TwirpError, VideoGrants
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_room_id() -> str:
    """Mock room's id."""
    return "d2aeb774-1ecd-4d73-a3ac-3d3530cad7ff"


@pytest.fixture
def mock_livekit_token(mock_room_id):
    """Mock LiveKit JWT token."""

    video_grants = VideoGrants(
        room=mock_room_id,
        room_join=True,
        room_admin=True,
        can_update_own_metadata=True,
        can_publish_sources=[
            "camera",
            "microphone",
            "screen_share",
            "screen_share_audio",
        ],
    )

    token = (
        AccessToken(
            api_key=settings.LIVEKIT_CONFIGURATION["api_key"],
            api_secret=settings.LIVEKIT_CONFIGURATION["api_secret"],
        )
        .with_grants(video_grants)
        .with_identity(str(uuid.uuid4()))
    )

    return token.to_jwt()


@pytest.fixture
def mock_livekit_client():
    """Mock LiveKit API client."""
    with mock.patch("core.utils.create_livekit_client") as mock_create:
        mock_client = mock.AsyncMock()
        mock_create.return_value = mock_client
        yield mock_client


def test_start_subtitle_missing_token_anonymous(settings):
    """Test that anonymous users cannot start subtitles without a valid LiveKit token."""

    settings.ROOM_SUBTITLE_ENABLED = True

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }


def test_start_subtitle_missing_token_authenticated(settings):
    """Test that authenticated users still need a valid LiveKit token to start subtitles."""

    settings.ROOM_SUBTITLE_ENABLED = True

    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }


def test_start_subtitle_invalid_token():
    """Test that malformed or invalid LiveKit tokens are rejected."""

    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/", {"token": "invalid-token"}
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Invalid LiveKit token: Not enough segments"}


def test_start_subtitle_disabled_by_default(mock_livekit_token):
    """Test that subtitle functionality is disabled when feature flag is off."""

    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {"token": mock_livekit_token},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Access denied, subtitles are disabled."}


def test_start_subtitle_valid_token(
    settings, mock_livekit_client, mock_livekit_token, mock_room_id
):
    """Test successful subtitle initiation with valid token and enabled feature."""

    settings.ROOM_SUBTITLE_ENABLED = True

    room = RoomFactory(id=mock_room_id)
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {"token": mock_livekit_token},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success"}

    mock_livekit_client.agent_dispatch.create_dispatch.assert_called_once()

    call_args = mock_livekit_client.agent_dispatch.create_dispatch.call_args[0][0]
    assert call_args.agent_name == "multi-user-transcriber"
    assert call_args.room == "d2aeb774-1ecd-4d73-a3ac-3d3530cad7ff"


def test_start_subtitle_twirp_error(
    settings, mock_livekit_client, mock_livekit_token, mock_room_id
):
    """Test handling of LiveKit service errors during subtitle initiation."""

    settings.ROOM_SUBTITLE_ENABLED = True

    room = RoomFactory(id=mock_room_id)
    client = APIClient()

    mock_livekit_client.agent_dispatch.create_dispatch.side_effect = TwirpError(
        msg="Internal server error", code=500, status=500
    )

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {"token": mock_livekit_token},
    )

    assert response.status_code == 500
    assert response.json() == {
        "error": f"Subtitles failed to start for room {room.slug}"
    }


def test_start_subtitle_wrong_room(settings, mock_livekit_token):
    """Test that tokens are validated against the correct room ID."""

    settings.ROOM_SUBTITLE_ENABLED = True

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {"token": mock_livekit_token},
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "You do not have permission to perform this action."
    }


def test_start_subtitle_wrong_signature(settings, mock_livekit_token):
    """Test that tokens signed with incorrect signature are rejected."""

    settings.ROOM_SUBTITLE_ENABLED = True
    settings.LIVEKIT_CONFIGURATION["api_secret"] = "wrong-secret"

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {"token": mock_livekit_token},
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Invalid LiveKit token: Signature verification failed"
    }
