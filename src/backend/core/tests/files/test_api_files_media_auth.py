"""
Test file uploads API endpoint for users in meet's core app.
"""

from io import BytesIO
from urllib.parse import quote, urlparse

from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone

import pytest
import requests
from freezegun import freeze_time
from rest_framework.test import APIClient

from core import factories, models

pytestmark = pytest.mark.django_db


def test_api_files_media_auth_anonymous_not_authorized():
    """Anonymous users should not be allowed to retrieve a file"""
    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.READY,
    )

    original_url = f"http://localhost/media/{file.file_key:s}"
    response = APIClient().get(
        "/api/v1.0/files/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 401


def test_api_files_media_get_own():
    """
    Authenticated user should be allowed to retrieve their own file.
    """
    user = factories.UserFactory()

    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.READY,
        creator=user,
    )

    client = APIClient()
    client.force_login(user)

    default_storage.save(
        file.file_key,
        BytesIO(b"my prose"),
    )

    original_url = f"http://localhost/media/{file.file_key:s}"
    now = timezone.now()
    with freeze_time(now):
        response = client.get(
            "/api/v1.0/files/media-auth/", HTTP_X_ORIGINAL_URL=original_url
        )

    assert response.status_code == 200

    authorization = response["Authorization"]
    assert "AWS4-HMAC-SHA256 Credential=" in authorization
    assert (
        "SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature="
        in authorization
    )
    assert response["X-Amz-Date"] == now.strftime("%Y%m%dT%H%M%SZ")

    s3_url = urlparse(settings.AWS_S3_ENDPOINT_URL)
    file_url = f"{settings.AWS_S3_ENDPOINT_URL:s}/meet-media-storage/{file.file_key:s}"
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


def test_api_files_media_auth_file_pending():
    """
    Users who have a specific access to an file, whatever the role, should not be able to
    retrieve related attachments if the file is not ready.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        upload_state=models.FileUploadStateChoices.PENDING,
        creator=user,
    )

    key = file.file_key

    original_url = quote(f"http://localhost/media/{key:s}")
    response = client.get(
        "/api/v1.0/files/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 403


def test_api_files_media_auth_own_file_deleted():
    """
    This function tests the access restrictions on deleted files through the media
    authorization API endpoint. It ensures that a user cannot retrieve a file that is deleted.
    """
    user = factories.UserFactory()

    file = factories.FileFactory(
        type=models.FileTypeChoices.BACKGROUND_IMAGE,
        update_upload_state=models.FileUploadStateChoices.READY,
        creator=user,
    )

    client = APIClient()
    client.force_login(user)

    default_storage.save(
        file.file_key,
        BytesIO(b"my prose"),
    )
    file.soft_delete()

    original_url = f"http://localhost/media/{file.file_key:s}"
    response = client.get(
        "/api/v1.0/files/media-auth/", HTTP_X_ORIGINAL_URL=original_url
    )

    assert response.status_code == 403
