"""
Test recordings API endpoints in the Meet core app: retrieve.
"""

import random
from unittest import mock

from django.core.files.storage import default_storage

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from freezegun import freeze_time
from rest_framework.test import APIClient

from ...factories import RecordingFactory, UserFactory, UserRecordingAccessFactory
from ...models import RecordingStatusChoices

pytestmark = pytest.mark.django_db


def media_recording_url(recording):
    """Return the direct media URL for a recording."""
    return f"/media/recordings/{recording.id!s}.{recording.extension}"


def test_api_recording_retrieve_anonymous():
    """Anonymous users should not be able to retrieve recordings."""
    recording = RecordingFactory()
    client = APIClient()
    response = client.get(f"/api/v1.0/recordings/{recording.id!s}/")

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }

    response = client.get(media_recording_url(recording))
    assert response.status_code == 401


def test_api_recording_retrieve_authenticated():
    """Authenticated users without access receive 404 when requesting recordings.

    The API returns 404 instead of 403 to avoid revealing the existence of
    resources the user doesn't have permission to access.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    other_user = UserFactory()
    recording = UserRecordingAccessFactory(user=other_user).recording

    response = client.get(f"/api/v1.0/recordings/{recording.id!s}/")
    assert response.status_code == 404
    assert response.json() == {"detail": "No Recording matches the given query."}

    response = client.get(media_recording_url(recording))
    assert response.status_code == 403


def test_api_recording_retrieve_members():
    """
    A user who is a member of a recording should not be able to retrieve it.
    """
    user = UserFactory()
    recording = RecordingFactory()

    UserRecordingAccessFactory(recording=recording, user=user, role="member")

    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/recordings/{recording.id!s}/")
    assert response.status_code == 403
    assert response.json() == {
        "detail": "You do not have permission to perform this action."
    }

    recording.status = RecordingStatusChoices.SAVED
    recording.save(update_fields=["status"])
    response = client.get(media_recording_url(recording))
    assert response.status_code == 403


def test_api_recording_retrieve_administrators(settings):
    """A user who is an administrator of a recording should be able to retrieve it."""
    settings.RECORDING_EXPIRATION_DAYS = None

    user = UserFactory()
    recording = RecordingFactory()

    UserRecordingAccessFactory(recording=recording, user=user, role="administrator")

    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/recordings/{recording.id!s}/")

    assert response.status_code == 200
    content = response.json()
    room = recording.room

    assert content == {
        "id": str(recording.id),
        "key": recording.key,
        "room": {
            "access_level": str(room.access_level),
            "id": str(room.id),
            "name": room.name,
            "slug": room.slug,
        },
        "created_at": recording.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": recording.updated_at.isoformat().replace("+00:00", "Z"),
        "status": str(recording.status),
        "mode": str(recording.mode),
        "options": {},
        "expired_at": None,
        "is_expired": False,
    }


def test_api_recording_retrieve_owners(settings):
    """A user who is an owner of a recording should be able to retrieve it."""
    settings.RECORDING_EXPIRATION_DAYS = None
    user = UserFactory()
    recording = RecordingFactory()

    UserRecordingAccessFactory(recording=recording, user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/recordings/{recording.id!s}/")

    assert response.status_code == 200
    content = response.json()
    room = recording.room

    assert content == {
        "id": str(recording.id),
        "key": recording.key,
        "room": {
            "access_level": str(room.access_level),
            "id": str(room.id),
            "name": room.name,
            "slug": room.slug,
        },
        "created_at": recording.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": recording.updated_at.isoformat().replace("+00:00", "Z"),
        "status": str(recording.status),
        "mode": str(recording.mode),
        "options": {},
        "expired_at": None,
        "is_expired": False,
    }


@pytest.mark.parametrize("role", ["owner", "administrator"])
def test_api_recording_media_download_authorized(role):
    """Owners and administrators can download a saved recording."""
    user = UserFactory()
    recording = RecordingFactory(status=RecordingStatusChoices.SAVED)
    UserRecordingAccessFactory(recording=recording, user=user, role=role)

    client = APIClient()
    client.force_login(user)
    body = mock.Mock(iter_chunks=mock.Mock(return_value=[b"recording content"]))
    s3_object = {
        "Body": body,
        "ContentType": "video/mp4",
        "ContentLength": len(b"recording content"),
    }
    with mock.patch.object(
        default_storage.connection.meta.client,
        "get_object",
        return_value=s3_object,
    ) as get_object:
        response = client.get(media_recording_url(recording))

    assert response.status_code == 200
    get_object.assert_called_once_with(
        Bucket=default_storage.bucket_name,
        Key=recording.key,
    )
    assert response["Content-Type"] == "video/mp4"
    assert response["Content-Disposition"] == (
        f'attachment; filename="{recording.id}.{recording.extension}"'
    )
    assert b"".join(response.streaming_content) == b"recording content"
    body.close.assert_called_once_with()


def test_api_recording_media_download_missing_object():
    """A missing recording object should return 404."""
    user = UserFactory()
    recording = RecordingFactory(status=RecordingStatusChoices.SAVED)
    UserRecordingAccessFactory(recording=recording, user=user, role="owner")

    client = APIClient()
    client.force_login(user)
    error = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "The object does not exist."}},
        "GetObject",
    )
    with mock.patch.object(
        default_storage.connection.meta.client, "get_object", side_effect=error
    ):
        response = client.get(media_recording_url(recording))

    assert response.status_code == 404


def test_api_recording_media_download_storage_unavailable():
    """A storage connection failure should return 503."""
    user = UserFactory()
    recording = RecordingFactory(status=RecordingStatusChoices.SAVED)
    UserRecordingAccessFactory(recording=recording, user=user, role="owner")

    client = APIClient()
    client.force_login(user)
    error = EndpointConnectionError(endpoint_url="https://storage.test")
    with mock.patch.object(
        default_storage.connection.meta.client, "get_object", side_effect=error
    ):
        response = client.get(media_recording_url(recording))

    assert response.status_code == 503


@freeze_time("2023-01-15 12:00:00")
def test_api_recording_retrieve_compute_expiration_date_correctly(settings):
    """Test that the API returns the correct expiration date for a non-expired recording."""
    settings.RECORDING_EXPIRATION_DAYS = 1

    user = UserFactory()
    recording = RecordingFactory()

    UserRecordingAccessFactory(
        recording=recording, user=user, role=random.choice(["administrator", "owner"])
    )

    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/recordings/{recording.id!s}/")

    assert response.status_code == 200
    content = response.json()
    room = recording.room

    assert content == {
        "id": str(recording.id),
        "key": recording.key,
        "room": {
            "access_level": str(room.access_level),
            "id": str(room.id),
            "name": room.name,
            "slug": room.slug,
        },
        "created_at": "2023-01-15T12:00:00Z",
        "updated_at": "2023-01-15T12:00:00Z",
        "status": str(recording.status),
        "mode": str(recording.mode),
        "options": {},
        "expired_at": "2023-01-16T12:00:00Z",
        "is_expired": False,  # Ensure the recording is still valid and hasn't expired
    }


def test_api_recording_retrieve_expired(settings):
    """Test that the API returns the correct expiration date and flag for an expired recording."""
    settings.RECORDING_EXPIRATION_DAYS = 2

    user = UserFactory()

    with freeze_time("2023-01-15 12:00:00"):
        recording = RecordingFactory()

    UserRecordingAccessFactory(
        recording=recording, user=user, role=random.choice(["administrator", "owner"])
    )

    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/recordings/{recording.id!s}/")

    assert response.status_code == 200
    content = response.json()
    room = recording.room

    assert content == {
        "id": str(recording.id),
        "key": recording.key,
        "room": {
            "access_level": str(room.access_level),
            "id": str(room.id),
            "name": room.name,
            "slug": room.slug,
        },
        "created_at": "2023-01-15T12:00:00Z",
        "updated_at": "2023-01-15T12:00:00Z",
        "status": str(recording.status),
        "mode": str(recording.mode),
        "options": {},
        "expired_at": "2023-01-17T12:00:00Z",
        "is_expired": True,  # Ensure the recording has expired
    }


@pytest.mark.parametrize(
    "status",
    [
        RecordingStatusChoices.INITIATED,
        RecordingStatusChoices.ACTIVE,
        RecordingStatusChoices.SAVED,
        RecordingStatusChoices.FAILED_TO_START,
        RecordingStatusChoices.FAILED_TO_STOP,
        RecordingStatusChoices.ABORTED,
    ],
)
def test_api_recording_retrieve_any_status(status):
    """Test that recordings with any status can be retrieved."""
    user = UserFactory()
    recording = RecordingFactory(status=status)

    UserRecordingAccessFactory(recording=recording, user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/recordings/{recording.id!s}/")

    assert response.status_code == 200
    content = response.json()
    assert content["id"] == str(recording.id)
    assert content["status"] == status
