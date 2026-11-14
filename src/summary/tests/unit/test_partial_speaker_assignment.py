"""Partial WhisperX responses must not discard every speaker's identity."""

from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import pytest

from summary.core import celery_worker
from summary.core.models import RecordingMetadata
from summary.core.shared_models import WhisperXResponse


@pytest.mark.parametrize(
    "partial_segment, expected_speaker",
    [
        ({"start": 1.0, "end": 2.0}, "Alice"),
        ({"start": 1.0, "end": 2.0, "words": None}, "Alice"),
        ({"start": 1.0, "end": 2.0, "words": []}, "Alice"),
        (
            {"end": 2.0, "words": [{"word": "Hello", "start": 1.0, "end": 2.0}]},
            "Alice",
        ),
        ({"start": None, "end": None, "words": None}, "SPEAKER_00"),
        ({"start": 1.0, "end": None, "words": []}, "SPEAKER_00"),
        (
            {"start": 1.0, "end": 2.0, "words": [{"word": "Hello"}]},
            "Alice",
        ),
    ],
)
def test_worker_keeps_available_speaker_assignments(
    monkeypatch, caplog, partial_segment, expected_speaker
):
    """Use real model serialization, VAD matching, rewriting and worker fallback."""
    started_at = datetime(2026, 11, 1, tzinfo=timezone.utc)
    metadata = {
        "participants": [
            {"participantId": "alice", "name": "Alice"},
            {"participantId": "bob", "name": "Bob"},
        ],
        "events": [
            {
                "participant_id": participant_id,
                "type": event_type,
                "timestamp": (started_at + timedelta(seconds=seconds)).isoformat(),
            }
            for participant_id, event_type, seconds in [
                ("alice", "speech_start", 1),
                ("alice", "speech_end", 2),
                ("bob", "speech_start", 3),
                ("bob", "speech_end", 4),
            ]
        ],
    }
    monkeypatch.setattr(
        celery_worker.file_service,
        "read_cloud_storage_json",
        Mock(return_value=metadata),
    )
    transcription = WhisperXResponse.model_validate(
        {
            "segments": [
                {"text": "Hello", "speaker": "SPEAKER_00", **partial_segment},
                {
                    "start": 3.0,
                    "end": 4.0,
                    "text": "Goodbye",
                    "speaker": "SPEAKER_01",
                    "words": [
                        {
                            "word": "Goodbye",
                            "start": 3.0,
                            "end": 4.0,
                            "speaker": "SPEAKER_01",
                        }
                    ],
                },
            ],
            "word_segments": [
                {"word": "Goodbye", "start": 3.0, "end": 4.0, "speaker": "SPEAKER_01"}
            ],
        }
    )
    original = transcription.model_dump()

    result = celery_worker.resolve_speaker_identities_and_apply_to(
        transcription=transcription,
        recording_metadata=RecordingMetadata(
            cloud_storage_url="https://example.com/metadata.json",
            started_at=started_at,
            ended_at=started_at + timedelta(seconds=5),
        ),
        task_id="partial-transcript",
    )

    assert [segment.speaker for segment in result.segments] == [expected_speaker, "Bob"]
    assert result.segments[1].words[0].speaker == "Bob"
    assert result.word_segments[0].speaker == "Bob"
    assert [segment.text for segment in result.segments] == ["Hello", "Goodbye"]
    assert result.segments[0].words == transcription.segments[0].words
    assert transcription.model_dump() == original
    assert "skipping speaker assignment" not in caplog.text
