"""
Test media-auth authorization API endpoint in docs core app.
"""

from io import BytesIO
from urllib.parse import urlparse
from uuid import uuid4

from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone

import pytest
import requests
from rest_framework.test import APIClient

from core import models
from core.factories import RecordingFactory, UserFactory, UserRecordingAccessFactory

pytestmark = pytest.mark.django_db


def test_api_recordings_media_auth_unauthenticated():
    """
    Test that unauthenticated requests to download media are rejected
    """
    original_url = f"http://localhost/media/recordings/{uuid4()!s}.mp4"

    response = APIClient().get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 401


def test_api_recordings_media_auth_wrong_path():
    """
    Test that media URLs with incorrect path structures are rejected
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    original_url = f"http://localhost/media/wrong-path/{uuid4()!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 403


def test_api_recordings_media_auth_unknown_recording():
    """
    Test that requests for non-existent recordings are properly handled
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    original_url = f"http://localhost/media/recordings/{uuid4()!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 404


def test_api_recordings_media_auth_no_abilities():
    """
    Test that users without any access permissions cannot download recordings
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    recording = RecordingFactory(status=models.RecordingStatusChoices.SAVED)
    original_url = f"http://localhost/media/recordings/{recording.id!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 403


def test_api_recordings_media_auth_wrong_abilities():
    """
    Test that users with insufficient role permissions cannot download recordings
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    recording = RecordingFactory(status=models.RecordingStatusChoices.SAVED)

    UserRecordingAccessFactory(user=user, recording=recording, role="member")

    original_url = f"http://localhost/media/recordings/{recording.id!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 403


@pytest.mark.parametrize("wrong_status", ["initiated", "active", "failed_to_stop"])
def test_api_recordings_media_auth_unsaved(wrong_status):
    """
    Test that recordings that aren't in 'saved' status cannot be downloaded
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    recording = RecordingFactory(status=wrong_status)
    UserRecordingAccessFactory(user=user, recording=recording, role="owner")

    original_url = f"http://localhost/media/recordings/{recording.id!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 403


def test_api_recordings_media_auth_mismatched_extension():
    """
    Test that requests with mismatched file extensions are rejected
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    recording = RecordingFactory(
        status=models.RecordingStatusChoices.SAVED,
        mode=models.RecordingModeChoices.TRANSCRIPT,
    )
    UserRecordingAccessFactory(user=user, recording=recording, role="owner")

    original_url = f"http://localhost/media/recordings/{recording.id!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "No recording found with this extension."}


@pytest.mark.parametrize(
    "wrong_extension", ["jpg", "txt", "mp3"], ids=["image", "text", "audio"]
)
def test_api_recordings_media_auth_wrong_extension(wrong_extension):
    """
    Trying to download a recording with an unsupported extension should return
    a validation error (400) with details about allowed extensions.
    """
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    recording = RecordingFactory(status=models.RecordingStatusChoices.SAVED)
    UserRecordingAccessFactory(user=user, recording=recording, role="owner")

    original_url = (
        f"http://localhost/media/recordings/{recording.id!s}.{wrong_extension}"
    )

    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Unsupported extension."}


@pytest.mark.parametrize("mode", ["screen_recording", "transcript"])
def test_api_recordings_media_auth_success_owner(mode):
    """
    Test downloading a recording when logged in and authorized.
    Verifies S3 authentication headers and successful file retrieval.
    """
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    recording = RecordingFactory(status=models.RecordingStatusChoices.SAVED, mode=mode)
    UserRecordingAccessFactory(user=user, recording=recording, role="owner")

    default_storage.connection.meta.client.put_object(
        Bucket=default_storage.bucket_name,
        Key=recording.key,
        Body=BytesIO(b"my prose"),
        ContentType="text/plain",
    )

    original_url = f"http://localhost/media/{recording.key:s}"
    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 200

    authorization = response["Authorization"]
    assert "AWS4-HMAC-SHA256 Credential=" in authorization
    assert (
        "SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature="
        in authorization
    )
    assert response["X-Amz-Date"] == timezone.now().strftime("%Y%m%dT%H%M%SZ")

    s3_url = urlparse(settings.AWS_S3_ENDPOINT_URL)
    file_url = f"{settings.AWS_S3_ENDPOINT_URL:s}/meet-media-storage/{recording.key:s}"
    response = requests.get(
        file_url,
        headers={
            "authorization": authorization,
            "x-amz-date": response["x-amz-date"],
            "x-amz-content-sha256": response["x-amz-content-sha256"],
            "Host": f"{s3_url.hostname:s}:{s3_url.port:d}",
        },
        timeout=1,
    )
    assert response.content.decode("utf-8") == "my prose"


@pytest.mark.parametrize("mode", ["screen_recording", "transcript"])
def test_api_recordings_media_auth_success_administrator(mode):
    """
    Test downloading a recording when logged in and authorized.
    Verifies S3 authentication headers and successful file retrieval.
    """
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    recording = RecordingFactory(status=models.RecordingStatusChoices.SAVED, mode=mode)
    UserRecordingAccessFactory(user=user, recording=recording, role="administrator")

    default_storage.connection.meta.client.put_object(
        Bucket=default_storage.bucket_name,
        Key=recording.key,
        Body=BytesIO(b"my prose"),
        ContentType="text/plain",
    )

    original_url = f"http://localhost/media/{recording.key:s}"
    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 200

    authorization = response["Authorization"]
    assert "AWS4-HMAC-SHA256 Credential=" in authorization
    assert (
        "SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature="
        in authorization
    )
    assert response["X-Amz-Date"] == timezone.now().strftime("%Y%m%dT%H%M%SZ")

    s3_url = urlparse(settings.AWS_S3_ENDPOINT_URL)
    file_url = f"{settings.AWS_S3_ENDPOINT_URL:s}/meet-media-storage/{recording.key:s}"
    response = requests.get(
        file_url,
        headers={
            "authorization": authorization,
            "x-amz-date": response["x-amz-date"],
            "x-amz-content-sha256": response["x-amz-content-sha256"],
            "Host": f"{s3_url.hostname:s}:{s3_url.port:d}",
        },
        timeout=1,
    )
    assert response.content.decode("utf-8") == "my prose"
