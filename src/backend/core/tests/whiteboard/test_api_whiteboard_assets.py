"""
Tests for whiteboard binary asset upload and retrieval API endpoints.
"""

from io import BytesIO
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.files.storage import default_storage
import pytest
from rest_framework.test import APIClient
from core.models import WhiteboardAsset, Room

pytestmark = pytest.mark.django_db


def test_upload_whiteboard_asset_success():
    """Test successful upload of a whiteboard image asset."""
    client = APIClient()
    image_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    uploaded = SimpleUploadedFile(
        "drawing.png", image_content, content_type="image/png"
    )

    response = client.post(
        "/api/v1.0/rooms/test-room-slug/whiteboard-assets/",
        {"file_id": "asset-12345", "file": uploaded},
        format="multipart",
    )

    assert response.status_code == 201
    data = response.json()
    assert data["file_id"] == "asset-12345"
    assert "/api/v1.0/rooms/test-room-slug/whiteboard-assets/asset-12345/" in data["url"]

    asset = WhiteboardAsset.objects.get(room_slug="test-room-slug", file_id="asset-12345")
    assert asset.mimetype == "image/png"
    assert default_storage.exists(asset.key)


def test_upload_whiteboard_asset_idempotent():
    """Re-uploading the same asset in the same room should return 200 OK without errors."""
    client = APIClient()
    image_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    uploaded = SimpleUploadedFile(
        "drawing.png", image_content, content_type="image/png"
    )

    res1 = client.post(
        "/api/v1.0/rooms/test-room-slug/whiteboard-assets/",
        {"file_id": "asset-dup-1", "file": uploaded},
        format="multipart",
    )
    assert res1.status_code == 201

    uploaded_again = SimpleUploadedFile(
        "drawing.png", image_content, content_type="image/png"
    )
    res2 = client.post(
        "/api/v1.0/rooms/test-room-slug/whiteboard-assets/",
        {"file_id": "asset-dup-1", "file": uploaded_again},
        format="multipart",
    )
    assert res2.status_code == 200
    assert res2.json()["file_id"] == "asset-dup-1"
    assert WhiteboardAsset.objects.filter(room_slug="test-room-slug", file_id="asset-dup-1").count() == 1


def test_upload_whiteboard_asset_missing_fields():
    """Uploading without file_id or file should fail with 400 Bad Request."""
    client = APIClient()

    # Missing file
    res1 = client.post(
        "/api/v1.0/rooms/test-room-slug/whiteboard-assets/",
        {"file_id": "asset-no-file"},
        format="multipart",
    )
    assert res1.status_code == 400
    assert "file is required" in res1.json()["detail"]

    # Missing file_id
    uploaded = SimpleUploadedFile("drawing.png", b"image", content_type="image/png")
    res2 = client.post(
        "/api/v1.0/rooms/test-room-slug/whiteboard-assets/",
        {"file": uploaded},
        format="multipart",
    )
    assert res2.status_code == 400
    assert "file_id is required" in res2.json()["detail"]


def test_upload_whiteboard_asset_invalid_extension():
    """Uploading a non-image file should fail."""
    client = APIClient()
    uploaded = SimpleUploadedFile("script.sh", b"#!/bin/sh", content_type="text/x-shellscript")

    res = client.post(
        "/api/v1.0/rooms/test-room-slug/whiteboard-assets/",
        {"file_id": "asset-bad-ext", "file": uploaded},
        format="multipart",
    )
    assert res.status_code == 400
    assert "not an allowed image format" in res.json()["detail"]


def test_retrieve_whiteboard_asset_success():
    """Retrieving an existing asset returns the file stream with cache headers."""
    client = APIClient()
    image_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    key = "whiteboard/my-room/asset-download-1.png"
    default_storage.save(key, BytesIO(image_content))

    WhiteboardAsset.objects.create(
        room_slug="my-room",
        file_id="asset-download-1",
        filename="canvas.png",
        mimetype="image/png",
        size=len(image_content),
        key=key,
    )

    response = client.get("/api/v1.0/rooms/my-room/whiteboard-assets/asset-download-1/")
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "image/png"
    assert "immutable" in response.headers["Cache-Control"]
    assert b"".join(response.streaming_content) == image_content


def test_retrieve_whiteboard_asset_not_found():
    """Retrieving a non-existent asset returns 404."""
    client = APIClient()
    response = client.get("/api/v1.0/rooms/my-room/whiteboard-assets/nonexistent-id/")
    assert response.status_code == 404
