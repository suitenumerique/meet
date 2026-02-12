"""
Test rooms API endpoints: chat attachment upload URL generation.
"""

import uuid

from django.conf import settings

import pytest
from livekit.api import AccessToken, VideoGrants
from rest_framework.test import APIClient

from ...factories import RoomFactory

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


def test_chat_file_upload_url_requires_token():
    """Anonymous users need a valid LiveKit token to generate URLs."""

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/chat-file-upload-url/",
        {"filename": "notes.pdf"},
        format="json",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }


def test_chat_file_upload_url_invalid_token():
    """Invalid token should be rejected."""

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/chat-file-upload-url/",
        {"token": "invalid-token", "filename": "notes.pdf"},
        format="json",
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Invalid LiveKit token: Not enough segments"}


def test_chat_file_upload_url_wrong_room(mock_livekit_token):
    """Token must target the same room as the route."""

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/chat-file-upload-url/",
        {"token": mock_livekit_token, "filename": "notes.pdf"},
        format="json",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "You do not have permission to perform this action."
    }


def test_chat_file_upload_url_success(mock_livekit_token, mock_room_id):
    """Generates signed upload and download URLs for valid requests."""

    room = RoomFactory(id=mock_room_id)
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/chat-file-upload-url/",
        {
            "token": mock_livekit_token,
            "filename": "project-spec.pdf",
            "content_type": "application/pdf",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["filename"] == "project-spec.pdf"
    assert response.json()["content_type"] == "application/pdf"
    assert "upload_url" in response.json()
    assert "download_url" in response.json()
