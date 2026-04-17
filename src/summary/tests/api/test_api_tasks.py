"""Integration tests for the API tasks endpoints."""

# tests/unit/test_api_tasks.py
from unittest.mock import MagicMock, patch


class TestTasks:
    """Tests for the /v1/tasks endpoint."""

    @patch(
        "summary.api.route.tasks.process_audio_transcribe_summarize_v2.apply_async",
        return_value=MagicMock(id="task-id-abc"),
    )
    @patch("summary.api.route.tasks.time.time", return_value=1735725600.0)
    def test_create_task_returns_task_id(self, mock_time, mock_apply_async, client):
        """POST /tasks/ with valid payload returns id and dispatches Celery task."""
        response = client.post(
            "api/v1/tasks/",
            headers={"Authorization": "Bearer test-api-token"},
            json={
                "owner_id": "owner-123",
                "recording_filename": "recording.mp4",
                "metadata_filename": "metadata.json",  # TODO: change
                "email": "user@example.com",
                "sub": "sub-123",
                "room": "room-abc",
                "worker_id": "EG_test123",
                "owner_timezone": "UTC",
                "language": None,
                "download_link": "http://example.com/file.mp4",
            },
        )

        assert response.status_code == 200
        assert response.json() == {"id": "task-id-abc", "message": "Task created"}

        args = mock_apply_async.call_args.kwargs["args"]
        print(args)
        assert args == [
            "owner-123",
            "recording.mp4",
            "metadata.json",
            "user@example.com",
            "sub-123",
            1735725600.0,
            "room-abc",
            "EG_test123",
            "UTC",
            None,
            "http://example.com/file.mp4",
            None,
            None,
            None,
        ]

    def test_create_task_invalid_language(self, client):
        """POST /tasks/ with an unsupported language returns 422."""
        payload = {"language": "klingon"}
        response = client.post(
            "/api/v1/tasks/",
            headers={"Authorization": "Bearer test-api-token"},
            json=payload,
        )

        assert response.status_code == 422

    @patch(
        "summary.api.route.tasks.AsyncResult",
        return_value=MagicMock(status="PENDING"),
    )
    def test_get_task_status_pending(self, mock_result, client):
        """GET /tasks/{id} returns PENDING status when the task has not started yet."""
        response = client.get(
            "/api/v1/tasks/task-id-abc",
            headers={"Authorization": "Bearer test-api-token"},
        )

        assert response.status_code == 200
        assert response.json() == {"id": "task-id-abc", "status": "PENDING"}

    @patch(
        "summary.api.route.tasks.AsyncResult",
        return_value=MagicMock(status="SUCCESS"),
    )
    def test_get_task_status_success(self, mock_result, client):
        """GET /tasks/{id} returns SUCCESS status when the task has completed."""
        response = client.get(
            "/api/v1/tasks/task-id-abc",
            headers={"Authorization": "Bearer test-api-token"},
        )

        assert response.status_code == 200
        assert response.json()["status"] == "SUCCESS"
