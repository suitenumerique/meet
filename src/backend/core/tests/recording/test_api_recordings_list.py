"""
Test recordings API endpoints in the Meet core app: list.
"""

import operator
from unittest import mock

import pytest
from rest_framework.pagination import PageNumberPagination
from rest_framework.test import APIClient

from core import factories

pytestmark = pytest.mark.django_db


def test_api_recordings_list_anonymous():
    """Anonymous users should not be able to list recordings."""
    factories.RecordingFactory()
    response = APIClient().get("/api/v1.0/recordings/")

    assert response.status_code == 401


def test_api_recordings_list_authenticated_no_recording():
    """
    Authenticated users listing recordings should only
    see recordings to which they have access.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    other_user = factories.UserFactory()
    factories.UserRecordingAccessFactory(user=other_user)

    response = client.get(
        "/api/v1.0/recordings/",
    )

    assert response.status_code == 200
    results = response.json()["results"]
    assert results == []


@pytest.mark.parametrize(
    "role",
    ["administrator", "member", "owner"],
)
def test_api_recordings_list_authenticated_direct(role, settings):
    """
    Authenticated users listing recordings, should only see the recordings
    to which they are related.
    """
    settings.RECORDING_EXPIRATIONS_DAYS = None
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    other_user = factories.UserFactory()

    access = factories.UserRecordingAccessFactory(role=role, user=user)
    factories.UserRecordingAccessFactory(user=other_user)

    recording = access.recording
    room = recording.room

    response = client.get(
        "/api/v1.0/recordings/",
    )

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    expected_ids = {
        str(recording.id),
    }
    result_ids = {result["id"] for result in results}
    assert expected_ids == result_ids
    assert results[0] == {
        "id": str(recording.id),
        "key": recording.key,
        "created_at": recording.created_at.isoformat().replace("+00:00", "Z"),
        "mode": recording.mode,
        "options": {},
        "room": {
            "access_level": str(room.access_level),
            "id": str(room.id),
            "name": room.name,
            "slug": room.slug,
        },
        "status": "initiated",
        "updated_at": recording.updated_at.isoformat().replace("+00:00", "Z"),
        "expired_at": None,
        "is_expired": False,
    }


def test_api_recording_list_authenticated_via_team(mock_user_get_teams):
    """
    Authenticated users should be able to list recordings they are a
    owner/administrator/member of via a team.
    """
    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    mock_user_get_teams.return_value = ["team1", "team2", "unknown"]

    recordings_team1 = [
        access.recording
        for access in factories.TeamRecordingAccessFactory.create_batch(2, team="team1")
    ]
    recordings_team2 = [
        access.recording
        for access in factories.TeamRecordingAccessFactory.create_batch(3, team="team2")
    ]

    expected_ids = {
        str(recording.id) for recording in recordings_team1 + recordings_team2
    }

    response = client.get("/api/v1.0/recordings/")

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 5
    results_id = {result["id"] for result in results}
    assert expected_ids == results_id


@mock.patch.object(PageNumberPagination, "get_page_size", return_value=2)
def test_api_recordings_list_pagination(_mock_page_size):
    """Pagination should work as expected."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    recording_ids = [
        str(access.recording_id)
        for access in factories.UserRecordingAccessFactory.create_batch(3, user=user)
    ]

    response = client.get("/api/v1.0/recordings/")

    assert response.status_code == 200
    content = response.json()
    assert content["count"] == 3
    assert content["next"] == "http://testserver/api/v1.0/recordings/?page=2"
    assert content["previous"] is None

    assert len(content["results"]) == 2
    for item in content["results"]:
        recording_ids.remove(item["id"])

    # Get page 2
    response = client.get(
        "/api/v1.0/recordings/?page=2",
    )

    assert response.status_code == 200
    content = response.json()

    assert content["count"] == 3
    assert content["next"] is None
    assert content["previous"], "http://testserver/api/v1.0/recordings/"

    assert len(content["results"]) == 1
    recording_ids.remove(content["results"][0]["id"])
    assert recording_ids == []


def test_api_recordings_list_authenticated_distinct():
    """A recording for a room with several related users should only be listed once."""
    user = factories.UserFactory()
    other_user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    recording = factories.RecordingFactory(users=[user, other_user])

    response = client.get("/api/v1.0/recordings/")

    assert response.status_code == 200
    content = response.json()
    assert len(content["results"]) == 1
    assert content["results"][0]["id"] == str(recording.id)


def test_api_recordings_list_ordering_default():
    """Recordings should be ordered by descending "updated_at" by default"""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    factories.RecordingFactory.create_batch(5, users=[user])

    response = client.get("/api/v1.0/recordings/")

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 5

    # Check that results are sorted by descending "updated_at" as expected
    for i in range(4):
        assert operator.ge(results[i]["updated_at"], results[i + 1]["updated_at"])
