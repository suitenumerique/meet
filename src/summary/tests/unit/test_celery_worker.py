"""Tests for the celery_worker module."""

import json
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import responses

from summary.core.celery_worker import (
    format_transcript,
    summarize_transcription,
    transcribe_audio,
)
from summary.core.config import get_settings
from summary.core.file_service import FileServiceException

settings = get_settings()

WEBHOOK_URL = settings.webhook_url

# ---------------------------------------------------------------------------
# transcribe_audio
# ---------------------------------------------------------------------------


class TestTranscribeAudio:
    """Tests for the transcribe_audio function."""

    @patch("summary.core.celery_worker.metadata_manager")
    @patch("summary.core.celery_worker.openai")
    @patch("summary.core.celery_worker.file_service")
    def test_success(self, mock_file_service, mock_openai, mock_metadata):
        """Transcription succeeds and returns the transcription object."""
        fake_audio = MagicMock()
        fake_metadata = {"duration": 120.5}

        @contextmanager
        def fake_prepare(filename):
            yield fake_audio, fake_metadata

        mock_file_service.prepare_audio_file = fake_prepare

        fake_transcription = SimpleNamespace(
            segments=[{"speaker": "SPEAKER_00", "text": "Hello"}],
        )
        mock_client = MagicMock()
        mock_client.audio.transcriptions.create.return_value = fake_transcription
        mock_openai.OpenAI.return_value = mock_client

        result = transcribe_audio("task-1", "recording.ogg", "en")

        assert result is fake_transcription
        mock_client.audio.transcriptions.create.assert_called_once()
        call_kwargs = mock_client.audio.transcriptions.create.call_args
        assert call_kwargs.kwargs["language"] == "en"
        assert call_kwargs.kwargs["file"] is fake_audio

    @patch("summary.core.celery_worker.metadata_manager")
    @patch("summary.core.celery_worker.openai")
    @patch("summary.core.celery_worker.file_service")
    def test_file_service_error_returns_none(
        self, mock_file_service, mock_openai, mock_metadata
    ):
        """Returns None when the file cannot be retrieved."""

        @contextmanager
        def failing_prepare(filename):
            raise FileServiceException("download failed")
            yield

        mock_file_service.prepare_audio_file = failing_prepare

        result = transcribe_audio("task-1", "recording.ogg", "en")

        assert result is None
        mock_openai.OpenAI.return_value.audio.transcriptions.create.assert_not_called()


# ---------------------------------------------------------------------------
# format_transcript
# ---------------------------------------------------------------------------


class TestFormatTranscript:
    """Tests for the format_transcript function."""

    def test_with_segments(self):
        """Formats a transcription with segments into content and title."""
        transcription = {
            "segments": [
                {"speaker": "SPEAKER_00", "text": "Hello everyone."},
                {"speaker": "SPEAKER_01", "text": "Good morning."},
            ],
        }

        content, title = format_transcript(
            transcription,
            context_language="en",
            language="en",
            room="Daily standup",
            recording_date="2026-03-04",
            recording_time="09:00",
            download_link="https://example.com/rec.ogg",
        )

        assert "SPEAKER_00" in content
        assert "Hello everyone." in content
        assert "SPEAKER_01" in content
        assert "Good morning." in content
        assert "Daily standup" in title
        assert "2026-03-04" in title
        assert "09:00" in title

    @pytest.mark.parametrize(
        "context_language, expected_string",
        [
            ("en", "Download your recording"),
            ("fr", "Télécharger votre enregistrement"),
            ("de", "diesem Link folgen"),
            ("nl", "Download uw opname door"),
        ],
    )
    def test_context_language(self, context_language, expected_string):
        """Context language parameter modifies output."""
        transcription = {
            "segments": [
                {"speaker": "SPEAKER_00", "text": "Hello everyone."},
            ],
        }

        content, title = format_transcript(
            transcription,
            context_language=context_language,
            language="en",
            room="Daily standup",
            recording_date="2026-03-04",
            recording_time="09:00",
            download_link="https://example.com/rec.ogg",
        )

        assert expected_string in content

    def test_empty_segments(self):
        """Returns empty-transcription message when there are no segments."""
        transcription = {"segments": []}

        content, title = format_transcript(
            transcription,
            context_language="en",
            language="en",
            room=None,
            recording_date=None,
            recording_time=None,
            download_link=None,
        )

        assert "No audio content" in content or "Transcription" in title


# ---------------------------------------------------------------------------
# summarize_transcription
# ---------------------------------------------------------------------------


class TestSummarizeTranscription:
    """Tests for the summarize_transcription Celery task."""

    @responses.activate
    @patch("summary.core.celery_worker.LLMService")
    @patch("summary.core.celery_worker.LLMObservability")
    @patch("summary.core.celery_worker.analytics")
    def test_generates_and_submits_summary(
        self, mock_analytics, mock_observability_cls, mock_llm_cls
    ):
        """Assembles TLDR + parts + next steps + cleaning, then submits."""
        mock_analytics.is_feature_enabled.return_value = False

        # Mock the webhook HTTP endpoint
        responses.post(
            WEBHOOK_URL,
            json={"id": "doc-42"},
            status=200,
        )

        mock_llm = MagicMock()
        mock_llm_cls.return_value = mock_llm

        plan_json = json.dumps({"titles": ["Topic A", "Topic B"]})
        next_steps_json = json.dumps(
            {
                "actions": [
                    {
                        "title": "What's nice about Visio",
                        "assignees": ["Aleb"],
                        "due_date": "2026-03-04",
                    }
                ]
            }
        )

        # LLM calls in order: tldr, parts (plan), part A, part B, next-steps, cleaning
        mock_llm.call.side_effect = [
            "### TL;DR\nShort summary.",  # tldr
            plan_json,  # parts plan
            "### Topic A\nDetails about A.",  # part A
            "### Topic B\nDetails about B.",  # part B
            next_steps_json,  # next steps
            "Cleaned summary content.",  # cleaning
        ]

        mock_observability = MagicMock()
        mock_observability_cls.return_value = mock_observability

        # Push a fake request context so self.request.id is available
        summarize_transcription.push_request(id="summary-task-1")
        try:
            summarize_transcription.run(
                "owner-1",
                "Full transcript text",
                "user@example.com",
                "oidc-sub-123",
                "99.999% uptime. Is it reasonable ?",
            )
        finally:
            summarize_transcription.pop_request()

        # Verify the webhook was called with the assembled summary
        assert len(responses.calls) == 1
        webhook_request = responses.calls[0]
        submitted_payload = json.loads(webhook_request.request.body)

        assert "TL;DR" in submitted_payload["content"]
        assert "Cleaned summary content." in submitted_payload["content"]
        assert "What's nice about Visio" in submitted_payload["content"]
        assert "99.999% uptime. Is it reasonable ?" in submitted_payload["title"]
        assert submitted_payload["email"] == "user@example.com"
        assert submitted_payload["sub"] == "oidc-sub-123"

        # Verify auth header was sent
        assert (
            webhook_request.request.headers["Authorization"]
            == f"Bearer {settings.webhook_api_token.get_secret_value()}"
        )

        # LLM was called for: tldr, plan, part A, part B, next-steps, cleaning
        expected_llm_calls = 6
        assert mock_llm.call.call_count == expected_llm_calls

        mock_observability.flush.assert_called_once()
