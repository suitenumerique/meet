"""
Test recordings API endpoints: external process hook.
"""

# pylint: disable=redefined-outer-name,unused-argument

import pytest

from ...factories import RecordingFactory
from ...models import RecordingStatusChoices

pytestmark = pytest.mark.django_db


@pytest.fixture
def external_process_settings(settings):
    """Configure authentication token for the external process webhook."""
    settings.SUMMARY_SERVICE_WEBHOOK_API_TOKEN = "testWebhookToken"
    return settings


def test_external_process_event_missing_authorization_header(
    external_process_settings, client
):
    """Requests without authorization must be rejected."""
    response = client.post(
        "/api/v1.0/recordings/external-process-hook/",
        {"job_id": "job-1", "type": "transcript", "status": "success"},
    )

    assert response.status_code == 401


def test_external_process_event_wrong_bearer_token(external_process_settings, client):
    """Requests with invalid bearer token must be rejected."""
    response = client.post(
        "/api/v1.0/recordings/external-process-hook/",
        {"job_id": "job-1", "type": "transcript", "status": "success"},
        HTTP_AUTHORIZATION="Bearer wrongToken",
    )

    assert response.status_code == 401


def test_external_process_event_missing_job_id(external_process_settings, client):
    """Payload without job_id must fail validation."""
    response = client.post(
        "/api/v1.0/recordings/external-process-hook/",
        {"type": "transcript", "status": "success"},
        HTTP_AUTHORIZATION="Bearer testWebhookToken",
    )

    assert response.status_code == 400
    assert response.json() == {"job_id": ["This field is required."]}


def test_external_process_event_success_updates_recording_status(
    external_process_settings, client
):
    """A successful transcript process should update recording status."""
    recording = RecordingFactory(
        status=RecordingStatusChoices.SAVED,
        external_process_id="job-123",
    )

    response = client.post(
        "/api/v1.0/recordings/external-process-hook/",
        {"job_id": "job-123", "type": "transcript", "status": "success"},
        HTTP_AUTHORIZATION="Bearer testWebhookToken",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Event processed."}

    recording.refresh_from_db()
    assert recording.status == RecordingStatusChoices.EXTERNAL_PROCESS_SUCCESSFUL


def test_external_process_event_failure_updates_recording_status(
    external_process_settings, client
):
    """A failing transcript process should update recording status."""
    recording = RecordingFactory(
        status=RecordingStatusChoices.SAVED,
        external_process_id="job-456",
    )

    response = client.post(
        "/api/v1.0/recordings/external-process-hook/",
        {"job_id": "job-456", "type": "transcript", "status": "failure"},
        HTTP_AUTHORIZATION="Bearer testWebhookToken",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Event processed."}

    recording.refresh_from_db()
    assert recording.status == RecordingStatusChoices.EXTERNAL_PROCESS_FAILED


def test_external_process_event_unknown_recording_is_ignored(
    external_process_settings, client
):
    """Unknown job_id should not fail the webhook processing."""
    response = client.post(
        "/api/v1.0/recordings/external-process-hook/",
        {"job_id": "missing-job", "type": "transcript", "status": "success"},
        HTTP_AUTHORIZATION="Bearer testWebhookToken",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Event processed."}


def test_external_process_event_non_transcript_event_does_not_change_status(
    external_process_settings, client
):
    """Only transcript events should update recording status."""
    recording = RecordingFactory(
        status=RecordingStatusChoices.SAVED,
        external_process_id="job-789",
    )

    response = client.post(
        "/api/v1.0/recordings/external-process-hook/",
        {"job_id": "job-789", "type": "thumbnail", "status": "success"},
        HTTP_AUTHORIZATION="Bearer testWebhookToken",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Event processed."}

    recording.refresh_from_db()
    assert recording.status == RecordingStatusChoices.SAVED
