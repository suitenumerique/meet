"""Integration test for the transcribe-and-summarize task flow via the API."""

import json
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import responses

from summary.core.config import get_settings

settings = get_settings()

API_PREFIX = "/api/v1"
AUTH_HEADER = {"Authorization": f"Bearer {settings.app_api_token.get_secret_value()}"}
WEBHOOK_URL = settings.webhook_url


class TestTranscribeSummarizeFlow:
    """End-to-end test: POST /tasks/ triggers transcription and summary via webhook."""

    @responses.activate
    @patch("summary.core.celery_worker.analytics")
    @patch("summary.core.celery_worker.LLMObservability")
    @patch("summary.core.celery_worker.LLMService")
    @patch("summary.core.celery_worker.metadata_manager")
    @patch("summary.core.celery_worker.openai")
    @patch("summary.core.celery_worker.file_service")
    def test_transcription_and_summary_are_submitted(
        self,
        mock_file_service,
        mock_openai,
        mock_metadata,
        mock_llm_cls,
        mock_observability_cls,
        mock_analytics,
        client,
        eager_celery,
    ):
        """Creating a task produces a transcription and summary sent to the webhook."""
        # Stub file service
        fake_audio = MagicMock()

        @contextmanager
        def fake_prepare(filename):
            yield fake_audio, {"duration": 60.0}

        mock_file_service.prepare_audio_file = fake_prepare

        # Stub WhisperX transcription
        fake_transcription = SimpleNamespace(
            segments=[
                {"speaker": "SPEAKER_00", "text": "Hello everyone."},
                {"speaker": "SPEAKER_01", "text": "Let's discuss the roadmap."},
            ],
        )
        mock_client = MagicMock()
        mock_client.audio.transcriptions.create.return_value = fake_transcription
        mock_openai.OpenAI.return_value = mock_client

        # Stub analytics to enable summary
        mock_analytics.is_feature_enabled.return_value = True

        # Stub LLM for summarization
        mock_llm = MagicMock()
        mock_llm_cls.return_value = mock_llm

        plan_json = json.dumps({"titles": ["Roadmap"]})
        next_steps_json = json.dumps(
            {
                "actions": [
                    {
                        "title": "Draft roadmap",
                        "assignees": ["Aleb"],
                        "due_date": "2026-03-04",
                    }
                ]
            }
        )
        mock_llm.call.side_effect = [
            "### TL;DR\nQuick overview.",  # tldr
            plan_json,  # parts plan
            "### Roadmap\nDetails.",  # part content
            next_steps_json,  # next steps
            "Cleaned summary.",  # cleaning
        ]

        mock_observability_cls.return_value = MagicMock()

        # Stub webhook (called twice: transcription + summary)
        responses.post(WEBHOOK_URL, json={"id": "doc-1"}, status=200)
        responses.post(WEBHOOK_URL, json={"id": "doc-2"}, status=200)

        payload = {
            "owner_id": "owner-1",
            "filename": "recording.webm",
            "email": "user@example.com",
            "sub": "user-sub-id",
            "room": "Visio room",
            "recording_date": "2026-03-04",
            "recording_time": "09:00",
            "language": "en",
            "download_link": "https://example.com/rec.webm",
            "context_language": "en",
        }

        response = client.post(
            f"{API_PREFIX}/tasks/", json=payload, headers=AUTH_HEADER
        )

        assert response.status_code == 200
        body = response.json()
        assert "id" in body
        assert body["message"] == "Task created"

        # Verify the webhook received the transcription
        assert len(responses.calls) >= 1
        transcript_payload = json.loads(responses.calls[0].request.body)
        assert "SPEAKER_00" in transcript_payload["content"]
        assert "Hello everyone." in transcript_payload["content"]
        assert "Visio room" in transcript_payload["title"]
        assert transcript_payload["email"] == "user@example.com"
        assert transcript_payload["sub"] == "user-sub-id"

        # Verify the webhook received the summary
        assert len(responses.calls) == 2
        summary_payload = json.loads(responses.calls[1].request.body)
        assert "TL;DR" in summary_payload["content"]
        assert "Cleaned summary." in summary_payload["content"]
        assert "Draft roadmap" in summary_payload["content"]
