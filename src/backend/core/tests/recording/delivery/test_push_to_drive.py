"""Tests for the task pushing a finished recording to its starter's Drive."""

# pylint: disable=redefined-outer-name,unused-argument

import json
from datetime import timedelta
from unittest import mock
from urllib.parse import parse_qs

from django.utils import timezone

import pytest
import responses

from core import factories, models
from core.audit.testing import find_events
from core.tasks.push_recording import push_recording_to_drive

pytestmark = pytest.mark.django_db

Status = models.RecordingDeliveryStatusChoices

API = "https://drive.example.com/external_api/v1.0"
FRONTEND = "https://drive.example.com"
S3_URL = "https://s3.example.com/recordings/recording.mp4"
POLICY_URL = "https://storage.example.com/upload?X-Amz-Signature=abc"
FOLDER_ID = "0b3c0ae4-91f9-4c47-a9fa-5d7a0c3f8f01"
FILE_ID = "8e5a7b1e-3a0c-4f63-b8a8-2f1f6f0c9d12"
MENSHEN = "https://menshen.example.com"


@pytest.fixture(autouse=True)
def drive_settings(settings, encryption_key):
    """Push recordings to Drive."""
    settings.RECORDING_STORAGE_METHOD = "drive"
    settings.RECORDING_DRIVE_FOLDER_NAME = "Visio-Recordings"
    settings.RECORDING_DRIVE_PUSH_MAX_ATTEMPTS = 3
    settings.DRIVE_API_BASE_URL = API
    settings.DRIVE_FRONTEND_BASE_URL = FRONTEND
    settings.DRIVE_UPLOAD_STORAGE_NETLOC = None
    settings.MENSHEN_SERVER_URL = MENSHEN
    settings.MENSHEN_CLIENT_ID = "meet"
    settings.MENSHEN_CLIENT_SECRET = "meet-secret"


@pytest.fixture(autouse=True)
def mock_download_url():
    """Sign object storage URLs without an object storage."""
    with mock.patch(
        "core.recording.delivery.drive.utils.generate_download_s3_url",
        return_value=S3_URL,
    ) as mocked:
        yield mocked


@pytest.fixture(autouse=True)
def mock_send_email():
    """Catch the emails sent."""
    with mock.patch("core.recording.delivery.drive.send_email") as mocked:
        yield mocked


@pytest.fixture
def delivery():
    """A recording being pushed: its starter, a room administrator, a member."""
    starter = factories.UserFactory(email="starter@example.com", language="fr-fr")
    recording = factories.RecordingFactory(
        mode="screen_recording",
        status="notification_succeeded",
        room__name="Weekly",
        room__slug="weekly",
    )
    factories.UserRecordingAccessFactory(
        recording=recording, user=starter, role=models.RoleChoices.OWNER
    )
    factories.UserRecordingAccessFactory(
        recording=recording,
        user__email="admin@example.com",
        role=models.RoleChoices.OWNER,
    )
    factories.UserRecordingAccessFactory(
        recording=recording,
        user__email="member@example.com",
        role=models.RoleChoices.MEMBER,
    )
    factories.TeamRecordingAccessFactory(
        recording=recording, role=models.RoleChoices.OWNER
    )

    delivery = factories.RecordingDeliveryFactory(
        recording=recording, user=starter, status=Status.PUSHING
    )
    delivery.set_token("user-access-token", None)
    delivery.save()
    return delivery


def mock_upload(folder_exists=False):
    """Mock the object storage and Drive calls of a successful upload."""
    responses.get(
        S3_URL,
        body=b"video",
        headers={"Content-Length": "5"},
        content_type="video/mp4",
    )
    responses.get(
        f"{API}/items/",
        json={
            "count": 1 if folder_exists else 0,
            "results": [
                {
                    "id": FOLDER_ID,
                    "type": "folder",
                    "title": "Visio-Recordings",
                    "depth": 1,
                }
            ]
            if folder_exists
            else [],
        },
    )
    if not folder_exists:
        responses.post(
            f"{API}/items/",
            match=[
                responses.matchers.json_params_matcher(
                    {"type": "folder", "title": "Visio-Recordings"}
                )
            ],
            json={"id": FOLDER_ID, "type": "folder", "depth": 1},
        )
    responses.post(
        f"{API}/items/{FOLDER_ID}/children/",
        json={"id": FILE_ID, "policy": POLICY_URL},
    )
    responses.put(POLICY_URL)
    responses.post(f"{API}/items/{FILE_ID}/upload-ended/", json={"id": FILE_ID})


def mock_share(status=201):
    """Mock sharing with the room administrator, a Drive user."""
    responses.get(
        f"{API}/users/",
        match=[responses.matchers.query_param_matcher({"q": "admin@example.com"})],
        json=[{"id": "drive-admin-id", "email": "admin@example.com"}],
    )
    responses.post(f"{API}/items/{FILE_ID}/accesses/", status=status, json={})


def calls_to(method, url):
    """Return the calls made with this method to this URL, ignoring the query."""
    return [
        call
        for call in responses.calls
        if call.request.method == method and call.request.url.split("?")[0] == url
    ]


@responses.activate
def test_push_to_drive_success(delivery, mock_send_email, audit_events):
    """The recording is streamed to a new folder, shared, and the starter emailed."""
    mock_upload()
    mock_share()

    assert push_recording_to_drive(str(delivery.recording_id)) is True

    delivery.refresh_from_db()
    assert delivery.status == Status.DELIVERED
    assert str(delivery.drive_item_id) == FILE_ID
    assert delivery.token is None
    assert delivery.error == ""

    [create_file] = calls_to("POST", f"{API}/items/{FOLDER_ID}/children/")
    filename = json.loads(create_file.request.body)["filename"]
    assert filename.startswith("weekly-") and filename.endswith(".mp4")
    assert all(
        call.request.headers.get("Authorization") == "Bearer user-access-token"
        for call in responses.calls
        if call.request.url.startswith(API)
    )
    [upload] = calls_to("PUT", POLICY_URL.split("?", maxsplit=1)[0])
    assert upload.request.headers["Content-Length"] == "5"

    # Only the room administrator is shared with: not the starter, a member or a team
    [share] = calls_to("POST", f"{API}/items/{FILE_ID}/accesses/")
    assert json.loads(share.request.body) == {
        "user_id": "drive-admin-id",
        "role": "owner",
    }

    mock_send_email.delay.assert_called_once()
    kwargs = mock_send_email.delay.call_args.kwargs
    assert kwargs["template"] == "recording_saved_to_drive"
    assert kwargs["recipients"] == ["starter@example.com"]
    assert kwargs["language"] == "fr-fr"
    assert kwargs["context"]["room_name"] == "Weekly"
    assert kwargs["context"]["folder_name"] == "Visio-Recordings"
    assert kwargs["context"]["link"] == f"{FRONTEND}/explorer/items/files/{FILE_ID}"

    [event] = find_events(audit_events, "recording.drive.push")
    assert event["lasuite"]["outcome"] == "success"
    assert event["lasuite"]["details"]["drive_item_id"] == FILE_ID
    assert "user-access-token" not in str(audit_events)


@responses.activate
def test_push_to_drive_existing_folder(delivery):
    """The user's recordings folder is reused."""
    mock_upload(folder_exists=True)
    mock_share()

    assert push_recording_to_drive(str(delivery.recording_id)) is True

    assert not calls_to("POST", f"{API}/items/")


@responses.activate
def test_push_to_drive_invites_unknown_email(delivery):
    """An administrator with no Drive account yet is invited."""
    mock_upload()
    responses.get(f"{API}/users/", json=[])
    responses.post(f"{API}/items/{FILE_ID}/invitations/", status=201, json={})

    assert push_recording_to_drive(str(delivery.recording_id)) is True

    [invitation] = calls_to("POST", f"{API}/items/{FILE_ID}/invitations/")
    assert json.loads(invitation.request.body) == {
        "email": "admin@example.com",
        "role": "owner",
    }


@responses.activate
def test_push_to_drive_share_failure(delivery, mock_send_email):
    """A file that could not be shared with everyone stays uploaded, starter emailed."""
    mock_upload()
    mock_share(status=403)

    assert push_recording_to_drive(str(delivery.recording_id)) is True

    delivery.refresh_from_db()
    assert delivery.status == Status.UPLOADED
    assert delivery.error == "Could not share with: admin@example.com"
    assert delivery.token is None
    mock_send_email.delay.assert_called_once()


@responses.activate
def test_push_to_drive_failure_retries(delivery, mock_send_email):
    """A failed push is tried again later, the incomplete file deleted."""
    mock_upload()
    responses.replace(responses.PUT, POLICY_URL, status=503)
    responses.delete(f"{API}/items/{FILE_ID}/", status=204)

    with mock.patch.object(push_recording_to_drive, "apply_async") as apply_async:
        assert push_recording_to_drive(str(delivery.recording_id)) is False

    apply_async.assert_called_once_with(
        args=(str(delivery.recording_id),), kwargs={"attempt": 2}, countdown=60
    )
    assert len(calls_to("DELETE", f"{API}/items/{FILE_ID}/")) == 1
    delivery.refresh_from_db()
    assert delivery.status == Status.PUSHING
    assert delivery.get_token() == "user-access-token"
    assert "503" in delivery.error
    mock_send_email.delay.assert_not_called()


@responses.activate
def test_push_to_drive_failure_last_attempt(delivery, mock_send_email, audit_events):
    """After the last attempt, the push fails, and nobody is emailed."""
    mock_upload()
    responses.replace(responses.GET, S3_URL, status=503)

    with mock.patch.object(push_recording_to_drive, "apply_async") as apply_async:
        assert push_recording_to_drive(str(delivery.recording_id), attempt=3) is False

    apply_async.assert_not_called()
    delivery.refresh_from_db()
    assert delivery.status == Status.FAILED
    assert delivery.token is None
    mock_send_email.delay.assert_not_called()

    [event] = find_events(audit_events, "recording.drive.push")
    assert event["lasuite"]["outcome"] == "failure"
    assert event["event"]["reason"] == "internal_error"


@responses.activate
def test_push_to_drive_refused(delivery, mock_send_email, audit_events):
    """A refused token is audited as an authentication failure."""
    responses.get(f"{API}/items/", status=401)

    with mock.patch.object(push_recording_to_drive, "apply_async") as apply_async:
        assert push_recording_to_drive(str(delivery.recording_id), attempt=3) is False

    apply_async.assert_not_called()
    delivery.refresh_from_db()
    assert delivery.status == Status.FAILED
    assert "401" in delivery.error
    mock_send_email.delay.assert_not_called()

    [event] = find_events(audit_events, "recording.drive.push")
    assert event["event"]["reason"] == "authentication_failed"


@responses.activate
def test_push_to_drive_expired_token(delivery):
    """A token known to be expired is not even tried."""
    delivery.token_expires_at = timezone.now() - timedelta(minutes=1)
    delivery.save()

    assert push_recording_to_drive(str(delivery.recording_id)) is False

    assert not responses.calls
    delivery.refresh_from_db()
    assert delivery.status == Status.FAILED
    assert "expired" in delivery.error


@responses.activate
@pytest.mark.parametrize("status", [Status.PENDING, Status.DELIVERED, Status.FAILED])
def test_push_to_drive_not_pushing(delivery, status):
    """Only a delivery handed over to the worker is pushed."""
    delivery.status = status
    delivery.save()

    assert push_recording_to_drive(str(delivery.recording_id)) is False

    assert not responses.calls
    delivery.refresh_from_db()
    assert delivery.status == status


def test_push_to_drive_no_delivery():
    """A recording without delivery cannot be pushed."""
    recording = factories.RecordingFactory()

    assert push_recording_to_drive(str(recording.id)) is False


@responses.activate
def test_push_to_drive_revokes_exchanged_token(delivery, httpx2_mock):
    """An exchanged token is revoked once the recording is in Drive."""
    delivery.token_type = models.DriveTokenTypeChoices.TOKEN_EXCHANGE
    delivery.set_token("exchanged-token", timezone.now() + timedelta(hours=1))
    delivery.save()
    mock_upload()
    mock_share()
    httpx2_mock.add_response(method="POST", url=f"{MENSHEN}/auth/token/revoke/")

    assert push_recording_to_drive(str(delivery.recording_id)) is True

    form = parse_qs(httpx2_mock.get_request().content.decode())
    assert form["token"] == ["exchanged-token"]
    delivery.refresh_from_db()
    assert delivery.token is None
    assert delivery.token_expires_at is None
