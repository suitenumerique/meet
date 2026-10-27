"""Integration tests for the V2 task API endpoints."""

from datetime import datetime
from unittest.mock import ANY, MagicMock, patch

import pytest


class TestTasksV2:
    """Tests for the /v2/async-jobs-jobs endpoints."""

    @patch(
        "summary.api.route.tasks_v2.process_audio_transcribe_v2_task.apply_async",
        return_value=MagicMock(id="transcribe-task-id-abc"),
    )
    def test_create_transcribe_task_v2_returns_task_id(self, mock_apply_async, client):
        """POST /async-jobs/transcribe creates a task and injects tenant_id."""
        response = client.post(
            "/api/v2/async-jobs/transcribe",
            headers={"Authorization": "Bearer test-api-token"},
            json={
                "user_sub": "remote-001",
                "cloud_storage_url": "https://example.com/audio.mp3",
                "language": "en",
                "context_language": "fr",
            },
        )

        assert response.status_code == 200
        assert response.json() == {
            "job_id": "transcribe-task-id-abc",
            "type": "transcript",
            "status": "pending",
        }

        args = mock_apply_async.call_args.kwargs["args"]
        received_at = args[0].pop("received_at")
        assert isinstance(received_at, datetime)
        assert args == [
            {
                "user_sub": "remote-001",
                "cloud_storage_url": "https://example.com/audio.mp3",
                "language": "en",
                "context_language": "fr",
                "tenant_id": "test-tenant",
                "user_email": None,
                "metadata": None,
                "push_to_docs_config": None,
            }
        ]

    @patch(
        "summary.api.route.tasks_v2.summarize_v2_task.apply_async",
        return_value=MagicMock(id="summarize-task-id-abc"),
    )
    def test_create_summarize_task_v2_returns_task_id(self, mock_apply_async, client):
        """POST /async-jobs/summarize creates a task and injects tenant_id."""
        response = client.post(
            "/api/v2/async-jobs/summarize",
            headers={"Authorization": "Bearer test-api-token"},
            json={
                "user_sub": "remote-002",
                "content": "This is a long meeting transcript to summarize.",
            },
        )

        assert response.status_code == 200
        assert response.json() == {
            "job_id": "summarize-task-id-abc",
            "type": "summary",
            "status": "pending",
        }

        args = mock_apply_async.call_args.kwargs["args"]
        received_at = args[0].pop("received_at")
        assert isinstance(received_at, datetime)
        assert args == [
            {
                "user_sub": "remote-002",
                "content": "This is a long meeting transcript to summarize.",
                "tenant_id": "test-tenant",
                "user_email": None,
            }
        ]

    @patch("summary.api.route.tasks_v2.celery")
    @patch("summary.api.route.tasks_v2.AsyncResult")
    def test_get_transcribe_task_status_returns_status_for_same_tenant(
        self, mock_async_result, mock_celery, client
    ):
        """GET /async-jobs/transcribe/{id} returns status when tenant matches."""
        mock_celery.backend.client.exists.return_value = True
        mock_async_result.return_value = MagicMock(
            status="PENDING",
            args=[{"tenant_id": "test-tenant"}],
        )

        response = client.get(
            "/api/v2/async-jobs/transcribe/task-id-abc",
            headers={"Authorization": "Bearer test-api-token"},
        )

        assert response.status_code == 200
        assert response.json() == {
            "job_id": "task-id-abc",
            "type": "transcript",
            "status": "pending",
        }

        mock_async_result.assert_called_once_with("task-id-abc", app=ANY)

    @patch("summary.api.route.tasks_v2.celery")
    @patch("summary.api.route.tasks_v2.AsyncResult")
    def test_get_summarize_task_status_returns_status_for_same_tenant(
        self, mock_async_result, mock_celery, client
    ):
        """GET /async-jobs/summarize/{id} returns status when tenant matches."""
        mock_celery.backend.client.exists.return_value = True
        mock_async_result.return_value = MagicMock(
            status="SUCCESS",
            args=[{"tenant_id": "test-tenant"}],
            result={
                "job_id": "task-id-abc",
                "summary_data_url": "https://example.com/summary.json",
            },
        )

        response = client.get(
            "/api/v2/async-jobs/summarize/task-id-abc",
            headers={"Authorization": "Bearer test-api-token"},
        )

        assert response.status_code == 200
        assert response.json() == {
            "job_id": "task-id-abc",
            "type": "summary",
            "status": "success",
            "summary_data_url": "https://example.com/summary.json",
        }

        mock_async_result.assert_called_once_with("task-id-abc", app=ANY)

    @patch("summary.api.route.tasks_v2.celery")
    @patch("summary.api.route.tasks_v2.AsyncResult")
    def test_get_task_status_returns_404_when_job_does_not_exist(
        self, mock_async_result, mock_celery, client
    ):
        """GET /async-jobs/.../{id} returns 404 when task key is not in Redis."""
        mock_celery.backend.client.exists.return_value = False

        response = client.get(
            "/api/v2/async-jobs/transcribe/task-id-abc",
            headers={"Authorization": "Bearer test-api-token"},
        )

        assert response.status_code == 404
        assert response.json() == {"detail": "Not found"}
        mock_async_result.assert_not_called()

    @patch("summary.api.route.tasks_v2.celery")
    @patch("summary.api.route.tasks_v2.AsyncResult")
    def test_get_task_status_returns_403_for_other_tenant(
        self, mock_async_result, mock_celery, client
    ):
        """GET /async-jobs/.../{id} returns 403 when task belongs to another tenant."""
        mock_celery.backend.client.exists.return_value = True
        mock_async_result.return_value = MagicMock(
            status="PENDING",
            args=[{"tenant_id": "another-tenant"}],
        )

        response = client.get(
            "/api/v2/async-jobs/summarize/task-id-abc",
            headers={"Authorization": "Bearer test-api-token"},
        )

        assert response.status_code == 403
        assert response.json() == {"detail": "Forbidden"}


@patch(
    "summary.api.route.tasks_v2.process_audio_transcribe_v2_task.apply_async",
    return_value=MagicMock(id="transcribe-job"),
)
def test_signed_urls_are_unwrapped_for_task_submission(mock_apply_async, client):
    """API input secrets reach Celery intact, including nested metadata URLs."""
    signed_url = "https://storage.example.com/file?signature=deterministic-signature"
    response = client.post(
        "/api/v2/async-jobs/transcribe",
        headers={"Authorization": "Bearer test-api-token"},
        json={
            "user_sub": "user",
            "language": "en",
            "cloud_storage_url": signed_url,
            "metadata": {
                "cloud_storage_url": signed_url,
                "started_at": "2026-01-01T10:00:00Z",
                "ended_at": "2026-01-01T11:00:00Z",
            },
        },
    )
    assert response.status_code == 200
    payload = mock_apply_async.call_args.kwargs["args"][0]
    assert payload["cloud_storage_url"] == signed_url
    assert payload["metadata"]["cloud_storage_url"] == signed_url


@pytest.mark.parametrize(
    "case",
    [
        ("transcribe", "transcript", "transcription_data_url"),
        ("summarize", "summary", "summary_data_url"),
    ],
)
@patch("summary.api.route.tasks_v2.celery")
@patch("summary.api.route.tasks_v2.AsyncResult")
def test_success_status_returns_usable_signed_url(
    mock_async_result, mock_celery, client, case
):
    """Success responses explicitly reveal result URLs for authorized clients."""
    job_type, payload_type, url_field = case
    signed_url = "https://storage.example.com/result?signature=deterministic-signature"
    mock_celery.backend.client.exists.return_value = True
    mock_async_result.return_value = MagicMock(
        status="SUCCESS",
        args=[{"tenant_id": "test-tenant"}],
        result={"job_id": "job", url_field: signed_url},
    )
    response = client.get(
        f"/api/v2/async-jobs/{job_type}/job",
        headers={"Authorization": "Bearer test-api-token"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "job_id": "job",
        "type": payload_type,
        "status": "success",
        url_field: signed_url,
    }
