"""Tests for the client of Drive's external API."""

# pylint: disable=redefined-outer-name

import io
import json

import pytest
import requests
import responses

from core.services.drive import DriveClient, DriveError

API = "https://drive.example.com/external_api/v1.0"
ITEM_ID = "6f0b2b43-bf2b-4c4f-9a35-7f34f3c1d0a1"


@pytest.fixture(autouse=True)
def drive_settings(settings):
    """Configure Drive's external API."""
    settings.DRIVE_API_BASE_URL = API
    settings.DRIVE_UPLOAD_STORAGE_NETLOC = None


@pytest.fixture
def drive():
    """Return a client calling Drive with a user token."""
    with DriveClient("user-token") as client:
        yield client


def folder(title, depth=1, **overrides):
    """Return a folder item as Drive lists it."""
    return {
        "id": ITEM_ID,
        "type": "folder",
        "title": title,
        "depth": depth,
        **overrides,
    }


def test_drive_client_requires_configuration(settings):
    """Without Drive's API URL, there is nothing to call."""
    settings.DRIVE_API_BASE_URL = None

    with pytest.raises(DriveError, match="DRIVE_API_BASE_URL"):
        DriveClient("user-token")


def test_drive_client_requires_token():
    """Drive is always called on behalf of a user."""
    with pytest.raises(DriveError, match="token"):
        DriveClient("")


@pytest.mark.parametrize("status_code", [401, 403, 429, 500])
def test_drive_error_from_http_error(status_code):
    """An error with an answer keeps its status code."""
    response = requests.Response()
    response.status_code = status_code

    error = DriveError.from_request_exception(
        "Failed", requests.HTTPError(response=response)
    )

    assert error.status_code == status_code
    assert str(error) == f"Failed ({status_code})"


def test_drive_error_from_connection_error():
    """An error with no answer at all has no status code."""
    error = DriveError.from_request_exception(
        "Failed", requests.ConnectionError("refused")
    )

    assert error.status_code is None
    assert str(error) == "Failed"


@responses.activate
def test_find_root_folder_exact_match(drive):
    """Only a folder with that exact title, at the root, is returned."""
    responses.get(
        f"{API}/items/",
        match=[
            responses.matchers.query_param_matcher(
                {"type": "folder", "title": "Visio-Recordings", "is_creator_me": "true"}
            ),
            responses.matchers.header_matcher({"Authorization": "Bearer user-token"}),
        ],
        json={
            "count": 4,
            "results": [
                folder("Old Visio-Recordings", id="1"),
                folder("visio-recordings", id="2"),
                folder("Visio-Recordings", depth=2, id="3"),
                folder("Visio-Recordings", id="4"),
            ],
        },
    )

    assert drive.find_root_folder("Visio-Recordings")["id"] == "4"


@responses.activate
def test_find_root_folder_missing(drive):
    """No matching folder gives None."""
    responses.get(f"{API}/items/", json={"count": 0, "results": []})

    assert drive.find_root_folder("Visio-Recordings") is None


@responses.activate
def test_create_folder(drive):
    """A folder is created at the root of the user's Drive."""
    responses.post(
        f"{API}/items/",
        match=[
            responses.matchers.json_params_matcher(
                {"type": "folder", "title": "Visio-Recordings"}
            )
        ],
        json=folder("Visio-Recordings"),
    )

    assert drive.create_folder("Visio-Recordings")["id"] == ITEM_ID


@responses.activate
def test_create_file_in_folder(drive):
    """A file is created in its folder, with an upload policy."""
    responses.post(
        f"{API}/items/{ITEM_ID}/children/",
        match=[
            responses.matchers.json_params_matcher(
                {"type": "file", "filename": "room.mp4", "size": 5}
            )
        ],
        json={"id": "file-id", "policy": "https://storage.example.com/upload"},
    )

    item = drive.create_file(filename="room.mp4", size=5, parent_id=ITEM_ID)

    assert item["policy"] == "https://storage.example.com/upload"


@responses.activate
def test_create_file_at_root(drive):
    """Without a folder, a file is created at the root."""
    responses.post(
        f"{API}/items/",
        json={"id": "file-id", "policy": "https://storage.example.com/upload"},
    )

    assert drive.create_file(filename="room.mp4", size=5)["id"] == "file-id"


@responses.activate
def test_create_file_without_policy(drive):
    """A file Drive gives no upload policy for cannot be uploaded."""
    responses.post(f"{API}/items/", json={"id": "file-id"})

    with pytest.raises(DriveError, match="upload policy"):
        drive.create_file(filename="room.mp4", size=5)


@responses.activate
@pytest.mark.parametrize("status_code", [403, 502])
def test_request_failure(drive, status_code):
    """A failed call raises, with its status code."""
    responses.post(f"{API}/items/", status=status_code)

    with pytest.raises(DriveError) as excinfo:
        drive.create_folder("Visio-Recordings")

    assert excinfo.value.status_code == status_code


@responses.activate
def test_delete_item(drive):
    """Deleting an item calls its endpoint."""
    responses.delete(f"{API}/items/{ITEM_ID}/", status=204)

    drive.delete_item(ITEM_ID)

    assert len(responses.calls) == 1


@responses.activate
def test_upload_content(drive):
    """The content is streamed to the presigned URL with its size."""
    responses.put("https://storage.example.com/upload")

    drive.upload_content(
        policy_url="https://storage.example.com/upload",
        stream=io.BytesIO(b"video"),
        content_length=5,
        content_type="video/mp4",
    )

    request = responses.calls[0].request
    assert request.headers["Content-Length"] == "5"
    assert request.headers["Content-Type"] == "video/mp4"
    assert request.headers["x-amz-acl"] == "private"
    assert "Authorization" not in request.headers


@responses.activate
def test_upload_content_storage_netloc_override(drive, settings):
    """In development, the address connected to changes, not the signed Host."""
    settings.DRIVE_UPLOAD_STORAGE_NETLOC = "drive-minio:9000"
    responses.put("https://drive-minio:9000/upload?X-Amz-Signature=abc")

    drive.upload_content(
        policy_url="https://localhost:9100/upload?X-Amz-Signature=abc",
        stream=io.BytesIO(b"video"),
        content_length=5,
        content_type="video/mp4",
    )

    assert responses.calls[0].request.headers["Host"] == "localhost:9100"


@responses.activate
def test_upload_content_failure(drive):
    """A failed upload raises, with its status code."""
    responses.put("https://storage.example.com/upload", status=503)

    with pytest.raises(DriveError) as excinfo:
        drive.upload_content(
            policy_url="https://storage.example.com/upload",
            stream=io.BytesIO(b"video"),
            content_length=5,
            content_type="video/mp4",
        )

    assert excinfo.value.status_code == 503


@responses.activate
def test_complete_upload(drive):
    """Drive is told when the upload is over."""
    responses.post(f"{API}/items/{ITEM_ID}/upload-ended/", json={"id": ITEM_ID})

    drive.complete_upload(ITEM_ID)

    assert len(responses.calls) == 1


@responses.activate
def test_find_user_by_email_exact_match(drive):
    """Drive's search tolerates typos: only the exact email, ignoring case, matches."""
    responses.get(
        f"{API}/users/",
        match=[responses.matchers.query_param_matcher({"q": "Jane@Example.com"})],
        json=[
            {"id": "1", "email": "jane@exemple.com"},
            {"id": "2", "email": "jane@example.com"},
        ],
    )

    assert drive.find_user_by_email("Jane@Example.com")["id"] == "2"


@responses.activate
def test_find_user_by_email_typo_only(drive):
    """An email only close to the expected one is not a match."""
    responses.get(f"{API}/users/", json=[{"id": "1", "email": "jane@exemple.com"}])

    assert drive.find_user_by_email("jane@example.com") is None


@responses.activate
def test_share_with_email_existing_user(drive):
    """An existing Drive user gets an access."""
    responses.get(
        f"{API}/users/", json=[{"id": "user-id", "email": "jane@example.com"}]
    )
    responses.post(f"{API}/items/{ITEM_ID}/accesses/", status=201, json={})

    drive.share_with_email(ITEM_ID, "jane@example.com", "owner")

    assert json.loads(responses.calls[1].request.body) == {
        "user_id": "user-id",
        "role": "owner",
    }


@responses.activate
def test_share_with_email_unknown_user(drive):
    """An email with no Drive account yet gets an invitation."""
    responses.get(f"{API}/users/", json=[])
    responses.post(f"{API}/items/{ITEM_ID}/invitations/", status=201, json={})

    drive.share_with_email(ITEM_ID, "jane@example.com", "owner")

    assert json.loads(responses.calls[1].request.body) == {
        "email": "jane@example.com",
        "role": "owner",
    }
