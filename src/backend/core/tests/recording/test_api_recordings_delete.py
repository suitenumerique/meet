"""
Test recordings API endpoints in the Meet core app: delete.
"""

import pytest
from rest_framework.test import APIClient

from ...audit.testing import capture_audit, find_events
from ...factories import RecordingFactory, UserFactory, UserRecordingAccessFactory
from ...models import Recording

pytestmark = pytest.mark.django_db


def test_api_recordings_delete_anonymous():
    """Anonymous users should not be allowed to destroy a recording."""
    recording = RecordingFactory()
    client = APIClient()

    response = client.delete(
        f"/api/v1.0/recordings/{recording.id!s}/",
    )

    assert response.status_code == 401
    assert Recording.objects.count() == 1


def test_api_recordings_delete_authenticated():
    """
    Authenticated users should not be allowed to delete a recording
    from which they are not related.
    """
    recording = RecordingFactory()
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/recordings/{recording.id!s}/",
    )

    assert response.status_code == 404
    assert Recording.objects.count() == 1


def test_api_recordings_delete_members():
    """
    Authenticated users should not be allowed to delete a recording
    from which they are only a member.
    """

    user = UserFactory()
    access = UserRecordingAccessFactory(role="member", user=user)

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/recordings/{access.recording.id}/",
    )

    assert response.status_code == 403
    assert Recording.objects.count() == 1


@pytest.mark.parametrize(
    "role",
    ["owner", "administrator"],
)
def test_api_recordings_delete_active(role):
    """
    Authenticated users cannot delete active recordings, even with deletion privileges.
    """

    user = UserFactory()

    recording = RecordingFactory(status="active")
    access = UserRecordingAccessFactory(role=role, user=user, recording=recording)

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/recordings/{access.recording.id}/",
    )

    assert response.status_code == 403
    assert Recording.objects.count() == 1


@pytest.mark.parametrize(
    "role",
    ["owner", "administrator"],
)
def test_api_recordings_delete_final(role):
    """
    Authenticated users should not be allowed to delete an active recording
    from which they are an admin or owner.
    """

    user = UserFactory()

    recording = RecordingFactory(status="saved")
    access = UserRecordingAccessFactory(role=role, user=user, recording=recording)

    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/recordings/{access.recording.id}/",
    )

    assert response.status_code == 204
    assert Recording.objects.count() == 0


def test_api_recordings_delete_is_audited():
    """A deleted recording is still identified by the event."""
    user = UserFactory()
    recording = RecordingFactory(status="saved", mode="transcript")
    UserRecordingAccessFactory(role="owner", user=user, recording=recording)
    client = APIClient()
    client.force_login(user)

    with capture_audit() as events:
        response = client.delete(f"/api/v1.0/recordings/{recording.id}/")

    assert response.status_code == 204

    [event] = find_events(events, "recording.delete")

    assert event["event"]["type"] == ["deletion"]
    assert event["lasuite"]["outcome"] == "success"
    assert event["entity"]["target"]["id"] == str(recording.id)
    assert event["entity"]["target"]["raw"]["mode"] == "transcript"
