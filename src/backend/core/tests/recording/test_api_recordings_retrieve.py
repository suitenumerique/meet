"""
Test recordings API endpoints in the Meet core app: retrieve.
"""

import pytest
from rest_framework.test import APIClient

from ...factories import RecordingFactory, UserFactory, UserRecordingAccessFactory
from ...models import RecordingStatusChoices

pytestmark = pytest.mark.django_db


def test_api_recording_retrieve_anonymous():
    """Anonymous users should not be able to retrieve recordings."""
    recording = RecordingFactory()
    client = APIClient()
    response = client.get(f"/api/v1.0/recordings/{recording.id!s}/")

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }


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


def test_api_recording_retrieve_administrators():
    """A user who is an administrator of a recording should be able to retrieve it."""

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
    }


def test_api_recording_retrieve_owners():
    """A user who is an owner of a recording should be able to retrieve it."""
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
