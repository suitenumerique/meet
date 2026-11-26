"""
Test media-auth authorization API endpoint in docs core app.
"""

from io import BytesIO
from urllib.parse import urlparse
from uuid import uuid4

from django.conf import settings
from django.core.files.storage import default_storage
from django.test import override_settings
from django.utils import timezone

import pytest
import requests
from rest_framework.test import APIClient

from core import models
from core.audit.testing import find_events
from core.factories import RecordingFactory, UserFactory, UserRecordingAccessFactory

pytestmark = pytest.mark.django_db

LATER_RANGE = "bytes=1000-"


def test_api_recordings_media_auth_unauthenticated(audit_events):
    """
    Test that unauthenticated requests to download media are rejected,
    audited as an anonymous refusal.
    """
    original_url = f"http://localhost/media/recordings/{uuid4()!s}.mp4"

    response = APIClient().get(
        "/api/v1.0/recordings/media-auth/",
        HTTP_X_ORIGINAL_URL=original_url,
        HTTP_RANGE=LATER_RANGE,
    )

    assert response.status_code == 401

    [event] = find_events(audit_events, "recording.download")

    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["actor"]["type"] == "anonymous"
    assert event["event"]["reason"] == "authentication_failed"
    assert "user" not in event
    assert "entity" not in event


def test_api_recordings_media_auth_wrong_path(audit_events):
    """
    Test that media URLs with incorrect path structures are rejected, audited
    as denied with no target.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    original_url = f"http://localhost/media/wrong-path/{uuid4()!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/",
        HTTP_X_ORIGINAL_URL=original_url,
        HTTP_RANGE=LATER_RANGE,
    )

    assert response.status_code == 403

    [event] = find_events(audit_events, "recording.download")

    assert event["lasuite"]["outcome"] == "denied"
    assert event["event"]["reason"] == "permission_denied"
    assert event["user"]["id"] == str(user.pk)
    assert "entity" not in event


@pytest.mark.parametrize(
    "url_case", [str.lower, str.upper], ids=["lowercase", "uppercase"]
)
def test_api_recordings_media_auth_unknown_recording(url_case, audit_events):
    """
    Test that requests for non-existent recordings are properly handled,
    audited on the recording id of the URL, lowercased.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    recording_id = str(uuid4())
    original_url = f"http://localhost/media/recordings/{url_case(recording_id):s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/",
        HTTP_X_ORIGINAL_URL=original_url,
        HTTP_RANGE=LATER_RANGE,
    )

    assert response.status_code == 404

    [event] = find_events(audit_events, "recording.download")

    assert event["lasuite"]["outcome"] == "failure"
    assert event["event"]["reason"] == "not_found"
    assert event["entity"]["target"] == {"id": recording_id, "sub_type": "recording"}


def test_api_recordings_media_auth_no_abilities(audit_events):
    """
    Test that users without any access permissions cannot download recordings,
    audited as denied on the recording.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    recording = RecordingFactory(status=models.RecordingStatusChoices.SAVED)
    original_url = f"http://localhost/media/recordings/{recording.id!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/",
        HTTP_X_ORIGINAL_URL=original_url,
        HTTP_RANGE=LATER_RANGE,
    )

    assert response.status_code == 403

    [event] = find_events(audit_events, "recording.download")

    assert event["lasuite"]["outcome"] == "denied"
    assert event["event"]["type"] == ["access"]
    assert event["event"]["reason"] == "permission_denied"
    assert event["user"]["id"] == str(user.pk)
    assert event["entity"]["target"]["id"] == str(recording.id)
    assert event["entity"]["target"]["raw"]["status"] == "saved"


@pytest.mark.parametrize(
    ("byte_range", "audited"),
    [
        (None, True),
        ("bytes=0-", True),
        ("bytes=0-1023", True),
        ("Bytes = 0-1023", True),
        (" BYTES=0 -", True),
        ("bytes=1000-", False),
        ("bytes=1000-1999", False),
        ("bytes=-500", False),
    ],
)
def test_api_recordings_media_auth_member(byte_range, audited, audit_events):
    """
    Members of a recording (e.g. its starter) are allowed to download it. A
    download or a playback starting at the first byte is audited once, on the
    recording and the account reading it, while the ranged requests of a player
    seeking or of a resumed download are let through without an event.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    recording = RecordingFactory(
        status=models.RecordingStatusChoices.SAVED, mode="transcript"
    )

    UserRecordingAccessFactory(user=user, recording=recording, role="member")

    original_url = f"http://localhost/media/{recording.key:s}"
    headers = {} if byte_range is None else {"HTTP_RANGE": byte_range}

    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url, **headers
    )

    assert response.status_code == 200
    assert "AWS4-HMAC-SHA256 Credential=" in response["Authorization"]

    if not audited:
        assert find_events(audit_events, "recording.download") == []
        return

    [event] = find_events(audit_events, "recording.download")

    assert event["event"]["category"] == ["file"]
    assert event["event"]["type"] == ["access"]
    assert event["lasuite"]["outcome"] == "success"
    assert event["lasuite"]["actor"]["type"] == "user"
    assert event["user"]["id"] == str(user.pk)
    assert event["entity"]["target"]["id"] == str(recording.id)
    assert event["entity"]["target"]["sub_type"] == "recording"
    assert event["entity"]["target"]["raw"]["mode"] == "transcript"
    assert "details" not in event["lasuite"]


@pytest.mark.parametrize("wrong_status", ["initiated", "active", "failed_to_stop"])
def test_api_recordings_media_auth_unsaved(wrong_status, audit_events):
    """
    Test that recordings that aren't in 'saved' status cannot be downloaded,
    audited as denied on the recording.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    recording = RecordingFactory(status=wrong_status)
    UserRecordingAccessFactory(user=user, recording=recording, role="owner")

    original_url = f"http://localhost/media/recordings/{recording.id!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/",
        HTTP_X_ORIGINAL_URL=original_url,
        HTTP_RANGE=LATER_RANGE,
    )

    assert response.status_code == 403

    [event] = find_events(audit_events, "recording.download")

    assert event["lasuite"]["outcome"] == "denied"
    assert event["event"]["reason"] == "permission_denied"
    assert event["entity"]["target"]["id"] == str(recording.id)
    assert event["entity"]["target"]["raw"]["status"] == wrong_status


def test_api_recordings_media_auth_mismatched_extension(audit_events):
    """
    Test that requests with mismatched file extensions are rejected, audited
    as a failure on the recording.
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
        "/api/v1.0/recordings/media-auth/",
        HTTP_X_ORIGINAL_URL=original_url,
        HTTP_RANGE=LATER_RANGE,
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "No recording found with this extension."}

    [event] = find_events(audit_events, "recording.download")

    assert event["lasuite"]["outcome"] == "failure"
    assert event["event"]["reason"] == "not_found"
    assert event["entity"]["target"]["id"] == str(recording.id)
    assert event["entity"]["target"]["raw"]["mode"] == "transcript"


@pytest.mark.parametrize(
    "wrong_extension", ["jpg", "txt", "mp3"], ids=["image", "text", "audio"]
)
def test_api_recordings_media_auth_wrong_extension(wrong_extension, audit_events):
    """
    Trying to download a recording with an unsupported extension should return
    a validation error (400) with details about allowed extensions, audited on
    the recording id of the URL.
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
        "/api/v1.0/recordings/media-auth/",
        HTTP_X_ORIGINAL_URL=original_url,
        HTTP_RANGE=LATER_RANGE,
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Unsupported extension."}

    [event] = find_events(audit_events, "recording.download")

    assert event["lasuite"]["outcome"] == "failure"
    assert event["event"]["reason"] == "validation_error"
    assert event["entity"]["target"] == {
        "id": str(recording.id),
        "sub_type": "recording",
    }


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


def test_api_recordings_media_auth_missing_header(audit_events):
    """
    Test that a subrequest without the configured original-url header is rejected,
    audited as denied with no target.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.get("/api/v1.0/recordings/media-auth/", HTTP_RANGE=LATER_RANGE)

    assert response.status_code == 403

    [event] = find_events(audit_events, "recording.download")

    assert event["lasuite"]["outcome"] == "denied"
    assert event["event"]["reason"] == "permission_denied"
    assert "entity" not in event


@override_settings(MEDIA_AUTH_ORIGINAL_URL_HEADER="HTTP_X_FORWARDED_URI")
def test_api_recordings_media_auth_custom_original_url_header():
    """
    Test that the header carrying the original URL can be configured.

    Reverse proxies other than nginx-ingress use different headers: Traefik's
    ForwardAuth sends X-Forwarded-Uri and cannot emit X-Original-URL at all.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    original_url = f"http://localhost/media/recordings/{uuid4()!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_FORWARDED_URI=original_url
    )

    # The header was read and parsed: we get as far as looking the recording up,
    # rather than being rejected for a missing header.
    assert response.status_code == 404


@override_settings(MEDIA_AUTH_ORIGINAL_URL_HEADER="HTTP_X_FORWARDED_URI")
def test_api_recordings_media_auth_default_header_ignored_when_reconfigured():
    """
    Test that only the configured header is honoured.

    Guards against the header being read from a hardcoded name in parallel with
    the setting.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    original_url = f"http://localhost/media/recordings/{uuid4()!s}.mp4"

    response = client.get(
        "/api/v1.0/recordings/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 403
