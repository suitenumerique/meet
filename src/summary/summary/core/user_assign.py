"""Assign WhisperX diarization speakers to participant identities.

Uses per-stream VAD events to match generic SPEAKER_XX labels provided
by diarization to real user id's by computing time overlap between
diarization segments and VAD intervals.

Multiple speakers can map to the same participant (e.g. two people sharing
one microphone). A participant with no matching speaker gets no assignment.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

# Minimum fraction of a speaker's total duration that must overlap with a
# participant's VAD to accept the assignment.
DEFAULT_OVERLAP_THRESHOLD = 0.5


@dataclass
class Interval:
    """A time interval in seconds relative to recording start."""

    start: float
    end: float


@dataclass
class SpeakerAssignment:
    """Maps a diarization speaker label to a participant."""

    speaker_label: str
    participant_id: str
    participant_name: str
    score: float


@dataclass
class AssignmentResult:
    """Result of speaker-to-participant assignment."""

    assignments: list[SpeakerAssignment] = field(default_factory=list)
    unassigned_speakers: list[str] = field(default_factory=list)

    def apply(self, diarization: dict[str, Any]) -> dict[str, Any]:
        """Return a copy of diarization with speaker labels replaced by names.

        Replaces `"speaker"` fields in segments and word_segments with the
        assigned participant name.  Unassigned speakers are left as-is.

        Args:
            diarization: WhisperX dict with `segments` and optionally
                `word_segments`.

        Returns:
            New dict with speaker labels replaced.
        """
        speaker_to_name = {
            a.speaker_label: a.participant_name for a in self.assignments
        }

        name_to_speaker_count = defaultdict(int)
        for name in speaker_to_name.values():
            name_to_speaker_count[name] += 1

        def _replace_speaker(item: dict[str, Any]) -> dict[str, Any]:
            if "speaker" in item and item["speaker"] in speaker_to_name:
                return {
                    **item,
                    "speaker": f"{speaker_to_name[item['speaker']]}"
                    + f" ({item['speaker']})"  # Add precision if there are multiple speakers for same user
                    * (name_to_speaker_count[speaker_to_name[item["speaker"]]] > 1),
                }
            return item

        result: dict[str, Any] = {}
        for key, value in diarization.items():
            if key in ("segments", "word_segments"):
                new_items = []
                for item in value:
                    new_item = _replace_speaker(item)
                    if key == "segments" and "words" in item:
                        new_item["words"] = [_replace_speaker(w) for w in item["words"]]
                    new_items.append(new_item)
                result[key] = new_items
            else:
                result[key] = value
        return result


def _merge_intervals(intervals: list[Interval]) -> list[Interval]:
    """Return a list of non-overlapping intervals sorted by start time."""
    if not intervals:
        return []
    sorted_intervals = sorted(intervals, key=lambda interval: interval.start)
    merged: list[Interval] = [
        Interval(sorted_intervals[0].start, sorted_intervals[0].end)
    ]
    for interval in sorted_intervals[1:]:
        if interval.start <= merged[-1].end:
            merged[-1].end = max(merged[-1].end, interval.end)
        else:
            merged.append(Interval(interval.start, interval.end))
    return merged


def _total_duration(intervals: list[Interval]) -> float:
    """Return the sum of all interval durations."""
    return sum(interval.end - interval.start for interval in intervals)


def _overlap_duration(
    a_intervals: list[Interval],
    b_intervals: list[Interval],
) -> float:
    """Compute total overlap between two merged interval lists, sorted by start time.

    Uses a sweep-line approach in O(n + m).
    """
    overlap = 0.0
    i = j = 0
    while i < len(a_intervals) and j < len(b_intervals):
        a = a_intervals[i]
        b = b_intervals[j]
        lo = max(a.start, b.start)
        hi = min(a.end, b.end)
        if lo < hi:
            overlap += hi - lo
        if a.end <= b.end:
            i += 1
        else:
            j += 1
    return overlap


def _parse_iso(ts: str) -> datetime:
    """Parse an ISO-formatted timestamp string."""
    return datetime.fromisoformat(ts)


def _build_participant_timelines(
    metadata: dict[str, Any],
    recording_start_datetime: datetime,
    recording_end_datetime: datetime | None = None,
) -> tuple[dict[str, list[Interval]], dict[str, str]]:
    """Build VAD interval timelines for each participant.

    Args:
        metadata: Dict with `events` and `participants` keys.
        recording_start_datetime: UTC datetime used as t=0 reference.
        recording_end_datetime: UTC datetime of recording end. When provided,
            any open speech_start without a matching speech_end is closed at
            this time (the participant is assumed to be speaking until the end).

    Returns:
        participant_id → merged VAD intervals
            (seconds relative to recording_start_datetime).
        participant_id → display name.
        Intervals are in seconds relative to recording_start_datetime.
        Events before recording start are clamped to 0.
    """
    events = metadata.get("events", [])
    participants_info = {
        p["participantId"]: p.get("name", p["participantId"])
        for p in metadata.get("participants", [])
    }

    ref_epoch = recording_start_datetime.timestamp()

    open_starts: dict[str, float] = {}
    intervals: dict[str, list[Interval]] = {}

    for event in events:
        pid = event["participant_id"]
        ts = _parse_iso(event["timestamp"]).timestamp() - ref_epoch
        etype = event["type"]

        if etype == "speech_start":
            open_starts[pid] = max(ts, 0.0)
        elif etype == "speech_end":
            start = open_starts.pop(pid, None)
            if start is not None:
                end = max(ts, 0.0)
                if end > start:
                    intervals.setdefault(pid, []).append(Interval(start, end))

    # Close any speech_start that was never matched by a speech_end.
    # Assume the participant kept speaking until the recording ended.
    if recording_end_datetime is not None and open_starts:
        recording_end = recording_end_datetime.timestamp() - ref_epoch
        for pid, start in open_starts.items():
            end = max(recording_end, 0.0)
            if end > start:
                intervals.setdefault(pid, []).append(Interval(start, end))

    for pid, pid_intervals in intervals.items():
        intervals[pid] = _merge_intervals(pid_intervals)

    return intervals, participants_info


def _build_speaker_timelines(
    transcription: Any,
) -> dict[str, list[Interval]]:
    """Build interval timelines from WhisperX transcription segments."""
    intervals: dict[str, list[Interval]] = {}

    segments = transcription.segments if hasattr(transcription, "segments") else []
    for segment in segments:
        speaker = segment.get("speaker")
        if speaker is None:
            continue
        intervals.setdefault(speaker, []).append(
            Interval(segment["start"], segment["end"])
        )

    for speaker, speaker_intervals in intervals.items():
        intervals[speaker] = _merge_intervals(speaker_intervals)

    return intervals


def assign_speakers(
    metadata: dict[str, Any],
    transcription: Any,
    recording_start_datetime: datetime,
    recording_end_datetime: datetime,
    overlap_threshold: float = DEFAULT_OVERLAP_THRESHOLD,
) -> AssignmentResult:
    """Match WhisperX speaker labels to participants.

    Args:
        metadata: User metadata with `events` and `participants`.
        transcription: WhisperX Transcription object with a `segments` attribute.
        recording_start_datetime: UTC datetime for t=0 reference.
        recording_end_datetime: UTC datetime of recording end. Open speech
            intervals are closed at this time.
        overlap_threshold: Minimum overlap/speaker_duration to accept.

    Returns:
        AssignmentResult with per-speaker assignments and unassigned
        speakers.
    """
    participant_timelines, participant_names = _build_participant_timelines(
        metadata, recording_start_datetime, recording_end_datetime
    )
    speaker_timelines = _build_speaker_timelines(transcription)

    logger.debug(
        "Assignment inputs: %d participants, %d speakers",
        len(participant_timelines),
        len(speaker_timelines),
    )

    result = AssignmentResult()

    for speaker, speaker_intervals in speaker_timelines.items():
        speaker_duration = _total_duration(speaker_intervals)
        if speaker_duration == 0:
            result.unassigned_speakers.append(speaker)
            continue

        best_pid: str | None = None
        best_score: float = 0.0

        for pid, part_intervals in participant_timelines.items():
            overlap = _overlap_duration(speaker_intervals, part_intervals)
            score = overlap / speaker_duration
            if score > best_score:
                best_score = score
                best_pid = pid

        if best_pid is not None and best_score >= overlap_threshold:
            result.assignments.append(
                SpeakerAssignment(
                    speaker_label=speaker,
                    participant_id=best_pid,
                    participant_name=participant_names.get(best_pid, best_pid),
                    score=best_score,
                )
            )
            logger.info(
                "Assigned %s -> %s (score=%.3f)",
                speaker,
                participant_names.get(best_pid, best_pid),
                best_score,
            )
        else:
            result.unassigned_speakers.append(speaker)
            logger.info(
                "Speaker %s unassigned (best=%.3f, threshold=%.3f)",
                speaker,
                best_score,
                overlap_threshold,
            )

    return result
