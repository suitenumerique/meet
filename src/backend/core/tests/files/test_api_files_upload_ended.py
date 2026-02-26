"""Test related to item upload ended API."""

import logging
from io import BytesIO

from django.core.files.storage import default_storage

import pytest
from rest_framework.test import APIClient

from core import factories, models
from core.models import FileTypeChoices, FileUploadStateChoices

pytestmark = pytest.mark.django_db


def test_api_file_upload_ended_anonymous():
    """Anonymous users should not be allowed to end an upload."""
    file = factories.FileFactory()
    response = APIClient().post(f"/api/v1.0/files/{file.id!s}/upload-ended/")

    assert response.status_code == 401


def test_api_file_upload_ended_non_creator_not_found():
    """Users without write permissions should not be allowed to end an upload."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory()

    response = client.post(f"/api/v1.0/files/{file.id!s}/upload-ended/")

    assert response.status_code == 404


def test_api_file_upload_ended_on_wrong_upload_state():
    """
    Users should not be allowed to end an upload on files that are not in the PENDING upload state.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory(
        type=FileTypeChoices.BACKGROUND_IMAGE,
        creator=user,
        update_upload_state=FileUploadStateChoices.READY,
    )

    response = client.post(f"/api/v1.0/files/{file.id!s}/upload-ended/")

    assert response.status_code == 400
    assert response.json() == {
        "file": "This action is only available for files in PENDING state."
    }


def test_api_file_upload_ended_success(settings):
    """
    Users should be able to end an upload on files that are files and in the UPLOADING upload state.
    """
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    settings.FILE_UPLOAD_APPLY_RESTRICTIONS = True
    settings.FILE_UPLOAD_RESTRICTIONS = {
        "background_image": {
            **settings.FILE_UPLOAD_RESTRICTIONS["background_image"],
            "allowed_mimetypes": ["text/html", "text/plain"],
        },
    }

    file = factories.FileFactory(
        type=FileTypeChoices.BACKGROUND_IMAGE,
        filename="my_file.txt",
        mimetype="text/html",
        creator=user,
    )

    default_storage.save(
        file.file_key,
        BytesIO(b"my prose"),
    )

    response = client.post(f"/api/v1.0/files/{file.id!s}/upload-ended/")

    assert response.status_code == 200

    file.refresh_from_db()
    assert file.upload_state == FileUploadStateChoices.READY
    assert file.mimetype == "text/plain"
    assert file.size == 8

    assert response.json()["mimetype"] == "text/plain"


def test_api_file_upload_ended_mimetype_not_allowed(settings, caplog):
    """
    Test that the API returns a 400 when the mimetype is not allowed.
    File should be deleted and the file should be deleted from the storage.
    """
    settings.RESTRICT_UPLOAD_FILE_TYPE = True
    settings.FILE_UPLOAD_RESTRICTIONS = {
        "background_image": {
            **settings.FILE_UPLOAD_RESTRICTIONS["background_image"],
            "allowed_mimetypes": ["application/pdf"],
        }
    }

    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory(
        type=FileTypeChoices.BACKGROUND_IMAGE, filename="my_file.txt", creator=user
    )

    default_storage.save(
        file.file_key,
        BytesIO(b"my prose"),
    )

    with caplog.at_level(logging.WARNING):
        response = client.post(f"/api/v1.0/files/{file.id!s}/upload-ended/")

    assert response.status_code == 400
    assert (
        f"upload_ended: mimetype not allowed text/plain for file {file.file_key}"
        in caplog.text
    )

    assert not models.File.objects.filter(id=file.id).exists()
    assert not default_storage.exists(file.file_key)


def test_api_file_upload_ended_mimetype_not_allowed_not_checking_mimetype(settings):
    """
    Test that the API returns a 200 when the mimetype is not allowed but not checking the mimetype.
    """
    settings.FILE_UPLOAD_APPLY_RESTRICTIONS = False
    settings.FILE_UPLOAD_RESTRICTIONS = {
        "background_image": {
            **settings.FILE_UPLOAD_RESTRICTIONS["background_image"],
            "allowed_mimetypes": ["application/pdf"],
        }
    }
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory(
        type=FileTypeChoices.BACKGROUND_IMAGE, filename="my_file.txt", creator=user
    )

    default_storage.save(
        file.file_key,
        BytesIO(b"my prose"),
    )

    response = client.post(f"/api/v1.0/files/{file.id!s}/upload-ended/")

    assert response.status_code == 200

    file.refresh_from_db()
    assert file.upload_state == FileUploadStateChoices.READY
    assert file.mimetype == "text/plain"
    assert file.size == 8

    assert response.json()["mimetype"] == "text/plain"


def test_api_upload_ended_mismatch_mimetype_with_object_storage(settings, caplog):
    """
    Object on storage should have the same mimetype than the one saved in the
    File object.
    """
    settings.FILE_UPLOAD_APPLY_RESTRICTIONS = True
    settings.FILE_UPLOAD_RESTRICTIONS = {
        "background_image": {
            **settings.FILE_UPLOAD_RESTRICTIONS["background_image"],
            "allowed_mimetypes": ["text/html", "application/pdf"],
        }
    }

    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory(
        type=FileTypeChoices.BACKGROUND_IMAGE,
        filename="my_file.pdf",
        title="my_file.pdf",
        creator=user,
    )

    s3_client = default_storage.connection.meta.client

    s3_client.put_object(
        Bucket=default_storage.bucket_name,
        Key=file.file_key,
        ContentType="text/html",
        Body=BytesIO(
            b'<meta http-equiv="refresh" content="0; url=https://fichiers.numerique.gouv.fr">'
        ),
        Metadata={
            "foo": "bar",
        },
    )

    head_object = s3_client.head_object(
        Bucket=default_storage.bucket_name, Key=file.file_key
    )

    assert head_object["ContentType"] == "text/html"
    with caplog.at_level(logging.INFO, logger="core.api.viewsets"):
        response = client.post(f"/api/v1.0/files/{file.id!s}/upload-ended/")
    assert (
        "upload_ended: content type mismatch between object storage and file,"
        " updating from text/html to application/pdf" in caplog.text
    )
    assert response.status_code == 200

    file.refresh_from_db()

    assert file.mimetype == "application/pdf"

    head_object = s3_client.head_object(
        Bucket=default_storage.bucket_name, Key=file.file_key
    )
    assert head_object["ContentType"] == "application/pdf"
    assert head_object["Metadata"] == {"foo": "bar"}


def test_api_upload_ended_file_size_exceeded(settings, caplog):
    """
    Test when the file size exceed the allowed max upload file size
    should return a 400 and delete the file.
    """

    settings.FILE_UPLOAD_RESTRICTIONS = {
        "background_image": {
            **settings.FILE_UPLOAD_RESTRICTIONS["background_image"],
            "max_size": 0,
        }
    }

    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    file = factories.FileFactory(
        type=FileTypeChoices.BACKGROUND_IMAGE, filename="my_file.txt", creator=user
    )

    default_storage.save(
        file.file_key,
        BytesIO(b"my prose"),
    )

    with caplog.at_level(logging.INFO, logger="core.api.viewsets"):
        response = client.post(f"/api/v1.0/files/{file.id!s}/upload-ended/")
    assert (
        f"upload_ended: file size (8) for file {file.file_key} higher than the allowed max size"
        in caplog.text
    )
    assert response.status_code == 400

    assert not models.File.objects.filter(id=file.id).exists()
    assert not default_storage.exists(file.file_key)
