"""
Test rooms API endpoints in the Meet core app: start subtitle.
"""
# pylint: disable=W0621

import uuid
from datetime import datetime, timedelta, timezone
from unittest import mock

from django.conf import settings

import jwt
import pytest
from livekit.api import AccessToken, TwirpError, VideoGrants
from rest_framework.test import APIClient

from ...factories import ApplicationFactory, RoomFactory, UserFactory
from ...models import ApplicationScope

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
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {},
        HTTP_AUTHORIZATION="X-LiveKit-Token invalid-token",
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
        {},
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {mock_livekit_token}",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found."}


def test_start_subtitle_valid_token(
    settings, mock_livekit_client, mock_livekit_token, mock_room_id
):
    """Test successful subtitle initiation with valid token and enabled feature."""

    settings.ROOM_SUBTITLE_ENABLED = True

    room = RoomFactory(id=mock_room_id)
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {},
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {mock_livekit_token}",
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
        msg="Internal server error", code="unknown", status=500
    )

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {},
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {mock_livekit_token}",
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
        {},
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {mock_livekit_token}",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "You do not have permission to perform this action."
    }


def test_start_subtitle_wrong_signature(settings, mock_livekit_token):
    """Test that tokens signed with incorrect signature are rejected."""

    settings.ROOM_SUBTITLE_ENABLED = True
    settings.LIVEKIT_CONFIGURATION["api_secret"] = "wrong-secret-padded-to-32-bytes!!"

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {},
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {mock_livekit_token}",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Invalid LiveKit token: Signature verification failed"
    }

@pytest.fixture
def user_access_token():
    """Generate a valid user access JWT, sent with the "Bearer" scheme."""
    user = UserFactory()
    now = datetime.now(timezone.utc)
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])

    payload = {
        "iss": settings.USER_ACCESS_TOKEN_ISSUER,
        "aud": settings.USER_ACCESS_TOKEN_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(seconds=settings.USER_ACCESS_TOKEN_TTL),
        "user_id": str(user.id),
        "token_type": "user_access",
        "client_id": application.client_id,
        "scope": "user:access",
    }

    return jwt.encode(
        payload,
        settings.USER_ACCESS_TOKEN_SECRET_KEY,
        algorithm=settings.USER_ACCESS_TOKEN_ALG,
    )


def test_start_subtitle_bearer_scheme_defers_to_next_authentication(
    settings, mock_livekit_client, user_access_token
):
    """Test that a "Bearer" header is deferred instead of failing on the LiveKit backend.

    The action declares LiveKitTokenAuthentication as its only backend, so a
    scheme it does not own must be left to the next one. None follows, so the
    request ends up unauthenticated: the body reports missing credentials
    rather than an invalid LiveKit token.
    """

    settings.ROOM_SUBTITLE_ENABLED = True

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {},
        HTTP_AUTHORIZATION=f"Bearer {user_access_token}",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }

    mock_livekit_client.agent_dispatch.create_dispatch.assert_not_called()


def test_start_subtitle_unknown_scheme_defers(settings, mock_livekit_client):
    """Test that a scheme no backend recognizes is deferred, not rejected."""

    settings.ROOM_SUBTITLE_ENABLED = True

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {},
        HTTP_AUTHORIZATION="Basic dXNlcjpwYXNzd29yZA==",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }

    mock_livekit_client.agent_dispatch.create_dispatch.assert_not_called()


def test_start_subtitle_scheme_is_case_insensitive(
    settings, mock_livekit_client, mock_livekit_token, mock_room_id
):
    """Test that the LiveKit scheme is claimed whatever its casing."""

    settings.ROOM_SUBTITLE_ENABLED = True

    room = RoomFactory(id=mock_room_id)
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {},
        HTTP_AUTHORIZATION=f"x-livekit-token {mock_livekit_token}",
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success"}

    mock_livekit_client.agent_dispatch.create_dispatch.assert_called_once()


def test_start_subtitle_malformed_header_is_rejected(
    settings, mock_livekit_client, mock_livekit_token
):
    """Test that a malformed header is rejected once the LiveKit scheme is claimed."""

    settings.ROOM_SUBTITLE_ENABLED = True

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-subtitle/",
        {},
        HTTP_AUTHORIZATION=f"X-LiveKit-Token {mock_livekit_token} extra-part",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Authorization header must be: X-LiveKit-Token <token>"
    }

    mock_livekit_client.agent_dispatch.create_dispatch.assert_not_called()
