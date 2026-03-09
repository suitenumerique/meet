"""
Tests for files API endpoint in meet's core app: create
"""

from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from django.utils import timezone

import pytest
from freezegun import freeze_time
from rest_framework import status
from rest_framework.test import APIClient

from core import factories
from core.models import File, FileTypeChoices, FileUploadStateChoices

pytestmark = pytest.mark.django_db


def test_api_files_create_anonymous():
    """Anonymous users should not be allowed to create items."""
    response = APIClient().post(
        "/api/v1.0/files/",
        {
            "title": "My file",
            "type": FileTypeChoices.BACKGROUND_IMAGE,
        },
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert not File.objects.exists()


def test_api_files_create_authenticated_success():
    """
    Authenticated users should be able to create files and should automatically be declared
    as the owner of the newly created file.
    """
    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/files/",
        {
            "title": "my file",
            "filename": "my_file.png",
            "type": FileTypeChoices.BACKGROUND_IMAGE,
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    file = File.objects.get()
    assert file.title == "my file"
    assert file.creator == user
    assert file.type == FileTypeChoices.BACKGROUND_IMAGE
    assert file.upload_state == FileUploadStateChoices.PENDING


def test_api_files_create_file_authenticated_no_filename():
    """
    Creating a file item without providing a filename should fail.
    """
    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/files/",
        {
            "title": "my item",
            "type": FileTypeChoices.BACKGROUND_IMAGE,
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.json() == {"filename": ["This field is required."]}


def test_api_files_create_file_authenticated_success():
    """
    Authenticated users should be able to create a file file and must provide a filename.
    """
    user = factories.UserFactory()

    client = APIClient()
    client.force_login(user)

    now = timezone.now()
    with freeze_time(now):
        response = client.post(
            "/api/v1.0/files/",
            {
                "type": FileTypeChoices.BACKGROUND_IMAGE,
                "title": "Eiffle tower",
                "filename": "file.png",
            },
            format="json",
        )
    assert response.status_code == 201
    file = File.objects.get()
    assert file.title == "Eiffle tower"
    assert file.type == FileTypeChoices.BACKGROUND_IMAGE
    assert file.filename == "file.png"

    response_data = response.json()
    assert response_data["creator"] is not None, response_data

    assert response.json().get("policy") is not None

    policy = response.json()["policy"]
    policy_parsed = urlparse(policy)

    assert policy_parsed.scheme == "http"
    assert policy_parsed.netloc == "localhost:9000"
    assert policy_parsed.path == f"/meet-media-storage/files/{file.id!s}/.png"

    query_params = parse_qs(policy_parsed.query)

    assert query_params.pop("X-Amz-Algorithm") == ["AWS4-HMAC-SHA256"]
    assert query_params.pop("X-Amz-Credential") == [
        f"meet/{now.strftime('%Y%m%d')}/us-east-1/s3/aws4_request"
    ]
    assert query_params.pop("X-Amz-Date") == [now.strftime("%Y%m%dT%H%M%SZ")]
    assert query_params.pop("X-Amz-Expires") == ["60"]
    assert query_params.pop("X-Amz-SignedHeaders") == ["host;x-amz-acl"]
    assert query_params.pop("X-Amz-Signature") is not None

    assert len(query_params) == 0


def test_api_files_create_file_authenticated_extension_not_allowed():
    """
    Creating a file item with an extension not allowed should fail.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    response = client.post(
        "/api/v1.0/files/",
        {
            "type": FileTypeChoices.BACKGROUND_IMAGE,
            "title": "Paris tower",
            "filename": "file.notallowed",
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.json() == {"filename": ["This file extension is not allowed."]}


def test_api_files_create_file_authenticated_extension_case_insensitive():
    """
    Creating a file item with an extension, no matter the case used, should be allowed.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    response = client.post(
        "/api/v1.0/files/",
        {
            "type": FileTypeChoices.BACKGROUND_IMAGE,
            "filename": "file.JPG",
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    file = File.objects.get()
    assert file.title == "file"


def test_api_files_create_file_disabled(settings):
    """
    Creating a file is denied if file upload is disabled
    """
    settings.FILE_UPLOAD_ENABLED = False
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    response = client.post(
        "/api/v1.0/files/",
        {
            "type": FileTypeChoices.BACKGROUND_IMAGE,
            "filename": "file.JPG",
        },
        format="json",
    )
    assert response.status_code == 404
    assert not File.objects.exists()


def test_api_files_create_file_authenticated_not_checking_extension(settings):
    """
    Creating a file with an extension not allowed should not fail when restrictions are disabled.
    """
    settings.FILE_UPLOAD_APPLY_RESTRICTIONS = False
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    response = client.post(
        "/api/v1.0/files/",
        {
            "type": FileTypeChoices.BACKGROUND_IMAGE,
            "filename": "file.notallowed",
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    file = File.objects.get()
    assert file.title == "file"


def test_api_files_create_file_authenticated_no_extension_but_checking_it_should_fail(
    settings,
):
    """
    Creating a file without an extension but checking the extension should fail.
    """
    settings.FILE_UPLOAD_APPLY_RESTRICTIONS = True
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    response = client.post(
        "/api/v1.0/files/",
        {
            "type": FileTypeChoices.BACKGROUND_IMAGE,
            "filename": "file",
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.json() == {"filename": ["This file extension is not allowed."]}


def test_api_files_create_file_authenticated_hidden_file_but_checking_extension_should_fail(
    settings,
):
    """
    Creating a hidden file (starting with a dot) but checking the extension should fail.
    """
    settings.FILE_UPLOAD_APPLY_RESTRICTIONS = True
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    response = client.post(
        "/api/v1.0/files/",
        {
            "type": FileTypeChoices.BACKGROUND_IMAGE,
            "filename": ".file",
        },
    )

    assert response.status_code == 400
    assert response.json() == {"filename": ["This file extension is not allowed."]}


def test_api_files_create_file_too_many(
    settings,
):
    """
    Creating a file is forbidden if above user limit.
    """
    settings.FILE_UPLOAD_APPLY_RESTRICTIONS = True
    settings.FILE_UPLOAD_RESTRICTIONS = {
        "background_image": {
            **settings.FILE_UPLOAD_RESTRICTIONS["background_image"],
            "max_count_by_user": 1,
        },
    }

    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)
    response = client.post(
        "/api/v1.0/files/",
        {
            "type": FileTypeChoices.BACKGROUND_IMAGE,
            "filename": "1.png",
        },
    )

    assert response.status_code == 201

    response = client.post(
        "/api/v1.0/files/",
        {
            "type": FileTypeChoices.BACKGROUND_IMAGE,
            "filename": "2.png",
        },
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "You have reached the maximum number of files for this type."
    }
    assert File.objects.count() == 1


def test_api_files_create_force_id_success():
    """It should be possible to force the item ID when creating a   item."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    forced_id = uuid4()

    response = client.post(
        "/api/v1.0/files/",
        {
            "id": str(forced_id),
            "title": "my item",
            "type": FileTypeChoices.BACKGROUND_IMAGE,
            "filename": "my_file.png",
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    files = File.objects.all()
    assert len(files) == 1
    assert files[0].id == forced_id


def test_api_files_create_force_id_existing():
    """
    It should not be possible to use the ID of an existing file when forcing ID on creation.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory()

    response = client.post(
        "/api/v1.0/files/",
        {
            "id": str(file.id),
            "title": "my file",
            "type": FileTypeChoices.BACKGROUND_IMAGE,
            "filename": "my_file.png",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "id": ["A file with this ID already exists. You cannot override it."]
    }


@pytest.mark.django_db(transaction=True)
def test_api_files_create_file_race_condition():
    """
    It should be possible to create several files at the same time
    without causing any race conditions or data integrity issues.
    """

    def create_item(title):
        user = factories.UserFactory()
        client = APIClient()
        client.force_login(user)
        return client.post(
            "/api/v1.0/files/",
            {
                "title": title,
                "type": FileTypeChoices.BACKGROUND_IMAGE,
                "filename": "my_file.png",
            },
            format="json",
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        future1 = executor.submit(create_item, "my item 1")
        future2 = executor.submit(create_item, "my item 2")

        response1 = future1.result()
        response2 = future2.result()

        assert response1.status_code == 201
        assert response2.status_code == 201
