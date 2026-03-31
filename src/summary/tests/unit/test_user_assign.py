"""Tests for the speaker-to-user assignment service."""

from dataclasses import dataclass, field
from datetime import datetime

from summary.core.user_assign import (
    AssignmentResult,
    Interval,
    SpeakerAssignment,
    _merge_intervals,
    _overlap_duration,
    _total_duration,
    assign_speakers,
)


@dataclass
class FakeTranscription:
    """Mimics the OpenAI Transcription pydantic model for testing."""

    segments: list = field(default_factory=list)

RECORDING_START = datetime.fromisoformat("2026-03-17T15:30:33.000001")
RECORDING_END = datetime.fromisoformat("2026-03-17T15:31:33.000001")

METADATA_SINGLE_USER = {
    "events": [
        {
            "participant_id": "da8d39ff-3b1c-4e8d-9a70-c630c9871bcb",
            "type": "participant_connected",
            "timestamp": "2026-03-17T15:30:33.000001",
        },
        {
            "participant_id": "da8d39ff-3b1c-4e8d-9a70-c630c9871bcb",
            "type": "speech_start",
            "timestamp": "2026-03-17T15:30:36.039456",
        },
        {
            "participant_id": "da8d39ff-3b1c-4e8d-9a70-c630c9871bcb",
            "type": "speech_end",
            "timestamp": "2026-03-17T15:30:36.589114",
        },
        {
            "participant_id": "da8d39ff-3b1c-4e8d-9a70-c630c9871bcb",
            "type": "speech_start",
            "timestamp": "2026-03-17T15:30:38.887518",
        },
        {
            "participant_id": "da8d39ff-3b1c-4e8d-9a70-c630c9871bcb",
            "type": "speech_end",
            "timestamp": "2026-03-17T15:30:39.438141",
        },
        {
            "participant_id": "da8d39ff-3b1c-4e8d-9a70-c630c9871bcb",
            "type": "participant_disconnected",
            "timestamp": "2026-03-17T15:30:43.223255",
        },
    ],
    "participants": [
        {
            "participantId": "da8d39ff-3b1c-4e8d-9a70-c630c9871bcb",
            "name": "cameledev",
        }
    ],
}

DIARIZATION_SINGLE_SPEAKER = FakeTranscription(
    segments=[
        {
            "start": 1.363,
            "end": 3.545,
            "text": " The stale smell.",
            "speaker": "SPEAKER_00",
        },
        {
            "start": 4.466,
            "end": 6.247,
            "text": "It takes heat.",
            "speaker": "SPEAKER_00",
        },
    ],
)

USER_ID = "da8d39ff-3b1c-4e8d-9a70-c630c9871bcb"


class TestMergeIntervals:
    """Tests for _merge_intervals."""

    def test_empty(self):
        """Empty input returns empty list."""
        assert _merge_intervals([]) == []

    def test_no_overlap(self):
        """Non-overlapping intervals stay separate."""
        result = _merge_intervals([Interval(1, 2), Interval(3, 4)])
        assert len(result) == 2

    def test_overlap(self):
        """Overlapping intervals are merged."""
        result = _merge_intervals([Interval(1, 3), Interval(2, 4)])
        assert len(result) == 1
        assert result[0].start == 1
        assert result[0].end == 4

    def test_adjacent(self):
        """Adjacent intervals are merged."""
        result = _merge_intervals([Interval(1, 2), Interval(2, 3)])
        assert len(result) == 1
        assert result[0].start == 1
        assert result[0].end == 3

    def test_unsorted(self):
        """Unsorted input is sorted before merging."""
        result = _merge_intervals([Interval(5, 6), Interval(1, 2)])
        assert len(result) == 2
        assert result[0].start == 1


class TestOverlapDuration:
    """Tests for _overlap_duration."""

    def test_no_overlap(self):
        """Disjoint intervals have zero overlap."""
        a = [Interval(1, 2)]
        b = [Interval(3, 4)]
        assert _overlap_duration(a, b) == 0.0

    def test_full_overlap(self):
        """Identical intervals have full overlap."""
        a = [Interval(1, 3)]
        b = [Interval(1, 3)]
        assert _overlap_duration(a, b) == 2.0

    def test_partial_overlap(self):
        """Partially overlapping intervals."""
        a = [Interval(1, 3)]
        b = [Interval(2, 4)]
        assert _overlap_duration(a, b) == 1.0

    def test_multiple_intervals(self):
        """Multiple intervals with a spanning interval."""
        a = [Interval(1, 3), Interval(5, 7)]
        b = [Interval(2, 6)]
        assert _overlap_duration(a, b) == 2.0

    def test_empty(self):
        """Empty input yields zero overlap."""
        assert _overlap_duration([], [Interval(1, 2)]) == 0.0
        assert _overlap_duration([Interval(1, 2)], []) == 0.0


class TestTotalDuration:
    """Tests for _total_duration."""

    def test_basic(self):
        """Sum of durations for multiple intervals."""
        ivs = [Interval(0, 1), Interval(2, 5)]
        assert _total_duration(ivs) == 4.0

    def test_empty(self):
        """Empty input returns zero."""
        assert _total_duration([]) == 0.0


class TestAssignSpeakers:
    """Tests for assign_speakers."""

    def test_single_speaker_single_user(self):
        """Single speaker assigned to single user with low threshold."""
        result = assign_speakers(
            METADATA_SINGLE_USER,
            DIARIZATION_SINGLE_SPEAKER,
            RECORDING_START,
            RECORDING_END,
            overlap_threshold=0.2,
        )
        assert len(result.assignments) == 1
        assert result.assignments[0].speaker_label == "SPEAKER_00"
        assert result.assignments[0].participant_id == USER_ID
        assert result.assignments[0].participant_name == "cameledev"
        assert result.assignments[0].score > 0
        assert result.unassigned_speakers == []

    def test_no_vad_events(self):
        """Participant with no speech leaves speakers unassigned."""
        metadata = {
            "events": [
                {
                    "participant_id": "user-a",
                    "type": "participant_connected",
                    "timestamp": "2026-03-17T15:30:33.000000",
                },
            ],
            "participants": [{"participantId": "user-a", "name": "Silent User"}],
        }
        result = assign_speakers(
            metadata,
            DIARIZATION_SINGLE_SPEAKER,
            RECORDING_START,
            RECORDING_END,
        )
        assert len(result.assignments) == 0
        assert "SPEAKER_00" in result.unassigned_speakers

    def test_multiple_speakers_same_user(self):
        """Two speakers from same mic both assigned to same user."""
        metadata = {
            "events": [
                {
                    "participant_id": "user-a",
                    "type": "speech_start",
                    "timestamp": "2026-03-17T15:30:35.000000",
                },
                {
                    "participant_id": "user-a",
                    "type": "speech_end",
                    "timestamp": "2026-03-17T15:30:50.000000",
                },
            ],
            "participants": [{"participantId": "user-a", "name": "Shared Mic"}],
        }
        transcription = FakeTranscription(
            segments=[
                {"start": 1.0, "end": 3.0, "speaker": "SPEAKER_00"},
                {"start": 5.0, "end": 7.0, "speaker": "SPEAKER_01"},
            ],
        )
        result = assign_speakers(metadata, transcription, RECORDING_START, RECORDING_END)
        assert len(result.assignments) == 2
        pids = {a.participant_id for a in result.assignments}
        assert pids == {"user-a"}

    def test_two_users_two_speakers(self):
        """Each speaker maps to correct user by VAD overlap."""
        metadata = {
            "events": [
                {
                    "participant_id": "user-a",
                    "type": "speech_start",
                    "timestamp": "2026-03-17T15:30:34.000001",
                },
                {
                    "participant_id": "user-a",
                    "type": "speech_end",
                    "timestamp": "2026-03-17T15:30:37.000001",
                },
                {
                    "participant_id": "user-b",
                    "type": "speech_start",
                    "timestamp": "2026-03-17T15:30:38.000001",
                },
                {
                    "participant_id": "user-b",
                    "type": "speech_end",
                    "timestamp": "2026-03-17T15:30:41.000001",
                },
            ],
            "participants": [
                {"participantId": "user-a", "name": "Alice"},
                {"participantId": "user-b", "name": "Bob"},
            ],
        }
        transcription = FakeTranscription(
            segments=[
                {"start": 1.5, "end": 3.5, "speaker": "SPEAKER_00"},
                {"start": 5.5, "end": 7.5, "speaker": "SPEAKER_01"},
            ],
        )
        result = assign_speakers(metadata, transcription, RECORDING_START, RECORDING_END)
        assert len(result.assignments) == 2
        by_speaker = {a.speaker_label: a for a in result.assignments}
        assert by_speaker["SPEAKER_00"].participant_name == "Alice"
        assert by_speaker["SPEAKER_01"].participant_name == "Bob"

    def test_overlapping_speech_two_users(self):
        """Simultaneous speech from two users still assigns each speaker correctly."""
        # user-a speaks from t=1s to t=6s, user-b speaks from t=3s to t=8s
        # (3s overlap where both are speaking)
        # SPEAKER_00 diarization covers t=1.5–5.5 (mostly user-a)
        # SPEAKER_01 diarization covers t=4.0–7.5 (mostly user-b)
        metadata = {
            "events": [
                {
                    "participant_id": "user-a",
                    "type": "speech_start",
                    "timestamp": "2026-03-17T15:30:34.000001",
                },
                {
                    "participant_id": "user-b",
                    "type": "speech_start",
                    "timestamp": "2026-03-17T15:30:36.000001",
                },
                {
                    "participant_id": "user-a",
                    "type": "speech_end",
                    "timestamp": "2026-03-17T15:30:39.000001",
                },
                {
                    "participant_id": "user-b",
                    "type": "speech_end",
                    "timestamp": "2026-03-17T15:30:41.000001",
                },
            ],
            "participants": [
                {"participantId": "user-a", "name": "Alice"},
                {"participantId": "user-b", "name": "Bob"},
            ],
        }
        transcription = FakeTranscription(
            segments=[
                {"start": 1.5, "end": 5.5, "speaker": "SPEAKER_00"},
                {"start": 4.0, "end": 7.5, "speaker": "SPEAKER_01"},
            ],
        )
        result = assign_speakers(
            metadata, transcription, RECORDING_START, RECORDING_END, overlap_threshold=0.3
        )
        assert len(result.assignments) == 2
        by_speaker = {a.speaker_label: a for a in result.assignments}
        assert by_speaker["SPEAKER_00"].participant_name == "Alice"
        assert by_speaker["SPEAKER_01"].participant_name == "Bob"
        assert result.unassigned_speakers == []

    def test_below_threshold(self):
        """Speaker with minimal overlap stays unassigned."""
        metadata = {
            "events": [
                {
                    "participant_id": "user-a",
                    "type": "speech_start",
                    "timestamp": "2026-03-17T15:30:34.000001",
                },
                {
                    "participant_id": "user-a",
                    "type": "speech_end",
                    "timestamp": "2026-03-17T15:30:35.169950",
                },
            ],
            "participants": [{"participantId": "user-a", "name": "Brief User"}],
        }
        transcription = FakeTranscription(
            segments=[
                {"start": 1.0, "end": 10.0, "speaker": "SPEAKER_00"},
            ],
        )
        result = assign_speakers(
            metadata,
            transcription,
            RECORDING_START,
            RECORDING_END,
            overlap_threshold=0.5,
        )
        assert len(result.assignments) == 0
        assert "SPEAKER_00" in result.unassigned_speakers

    def test_events_before_recording_start_clamped(self):
        """Speech events before recording start are clamped to t=0."""
        metadata = {
            "events": [
                {
                    "participant_id": "user-a",
                    "type": "speech_start",
                    "timestamp": "2026-03-17T15:30:31.000001",  # before RECORDING_START
                },
                {
                    "participant_id": "user-a",
                    "type": "speech_end",
                    "timestamp": "2026-03-17T15:30:36.000001",  # after RECORDING_START
                },
            ],
            "participants": [{"participantId": "user-a", "name": "Early User"}],
        }
        transcription = FakeTranscription(
            segments=[
                {"start": 0.0, "end": 3.0, "speaker": "SPEAKER_00"},
            ],
        )
        result = assign_speakers(metadata, transcription, RECORDING_START, RECORDING_END)
        assert len(result.assignments) == 1
        assert result.assignments[0].participant_name == "Early User"

    def test_empty_diarization(self):
        """No segments produces empty result."""
        result = assign_speakers(
            METADATA_SINGLE_USER, FakeTranscription(segments=[]), RECORDING_START, RECORDING_END
        )
        assert result == AssignmentResult()

    def test_segment_without_speaker_ignored(self):
        """Segments missing speaker key are skipped."""
        transcription = FakeTranscription(
            segments=[
                {"start": 1.0, "end": 3.0, "text": "no speaker"},
            ],
        )
        result = assign_speakers(METADATA_SINGLE_USER, transcription, RECORDING_START, RECORDING_END)
        assert result == AssignmentResult()

    def test_unclosed_speech_closed_at_recording_end(self):
        """Open speech_start without speech_end is closed at recording end."""
        recording_end = datetime.fromisoformat("2026-03-17T15:30:43.000001")
        metadata = {
            "events": [
                {
                    "participant_id": "user-a",
                    "type": "speech_start",
                    "timestamp": "2026-03-17T15:30:35.000001",
                },
                # No speech_end — participant kept speaking until recording stopped
            ],
            "participants": [{"participantId": "user-a", "name": "Still Talking"}],
        }
        transcription = FakeTranscription(
            segments=[
                {"start": 2.0, "end": 9.0, "speaker": "SPEAKER_00"},
            ],
        )
        result = assign_speakers(
            metadata, transcription, RECORDING_START, recording_end, overlap_threshold=0.5
        )
        assert len(result.assignments) == 1
        assert result.assignments[0].participant_name == "Still Talking"
        assert result.unassigned_speakers == []


class TestApply:
    """Tests for AssignmentResult.apply."""

    def test_replaces_speakers_in_segments_and_words(self):
        """Speaker labels replaced in segments, words, and word_segments."""
        diarization = {
            "segments": [
                {
                    "start": 1.0,
                    "end": 3.0,
                    "text": "Hello",
                    "speaker": "SPEAKER_00",
                    "words": [
                        {
                            "word": "Hello",
                            "start": 1.0,
                            "end": 1.5,
                            "speaker": "SPEAKER_00",
                        },
                    ],
                },
                {
                    "start": 4.0,
                    "end": 6.0,
                    "text": "World",
                    "speaker": "SPEAKER_01",
                    "words": [
                        {
                            "word": "World",
                            "start": 4.0,
                            "end": 4.5,
                            "speaker": "SPEAKER_01",
                        },
                    ],
                },
            ],
            "word_segments": [
                {"word": "Hello", "start": 1.0, "end": 1.5, "speaker": "SPEAKER_00"},
                {"word": "World", "start": 4.0, "end": 4.5, "speaker": "SPEAKER_01"},
            ],
        }
        assignment = AssignmentResult(
            assignments=[
                SpeakerAssignment("SPEAKER_00", "id-a", "Alice", 0.9),
                SpeakerAssignment("SPEAKER_01", "id-b", "Bob", 0.8),
            ],
        )
        result = assignment.apply(diarization)

        assert result["segments"][0]["speaker"] == "Alice"
        assert result["segments"][0]["words"][0]["speaker"] == "Alice"
        assert result["segments"][1]["speaker"] == "Bob"
        assert result["word_segments"][0]["speaker"] == "Alice"
        assert result["word_segments"][1]["speaker"] == "Bob"

    def test_unassigned_speakers_unchanged(self):
        """Unassigned speaker labels are left as-is."""
        diarization = {
            "segments": [
                {"start": 1.0, "end": 3.0, "speaker": "SPEAKER_02"},
            ],
        }
        assignment = AssignmentResult(
            assignments=[
                SpeakerAssignment("SPEAKER_00", "id-a", "Alice", 0.9),
            ],
            unassigned_speakers=["SPEAKER_02"],
        )
        result = assignment.apply(diarization)
        assert result["segments"][0]["speaker"] == "SPEAKER_02"

    def test_preserves_extra_keys(self):
        """Non-segment keys in diarization are preserved."""
        diarization = {
            "segments": [],
            "language": "en",
            "custom_field": 42,
        }
        result = AssignmentResult().apply(diarization)
        assert result["language"] == "en"
        assert result["custom_field"] == 42
