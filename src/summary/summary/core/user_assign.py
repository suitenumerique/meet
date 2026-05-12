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

from summary.core.config import get_settings

settings = get_settings()

logger = logging.getLogger(__name__)


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

    def apply_to(self, diarization: dict[str, Any]) -> dict[str, Any]:
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
                name = speaker_to_name[item["speaker"]]
                suffix = (
                    f" ({item['speaker']})" if name_to_speaker_count[name] > 1 else ""
                )  # Add suffix only if there are multiple detected speakers per user
                return {**item, "speaker": f"{name}{suffix}"}
            return {**item}

        def _process_segment(
            item: dict[str, Any], include_words: bool = False
        ) -> dict[str, Any]:
            new_item = _replace_speaker(item)
            if include_words and "words" in item:
                new_item["words"] = [_replace_speaker(w) for w in item["words"]]
            return new_item

        result: dict[str, Any] = {}
        for key, value in diarization.items():
            if key not in ("segments", "word_segments"):
                result[key] = value
                continue
            result[key] = [
                _process_segment(item, include_words=(key == "segments"))
                for item in value
            ]
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
    """Compute total overlap between two merged interval lists, sorted by start time."""
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


def _format_timelines_debug(
    participant_timelines: dict[str, list[Interval]],
    participant_names: dict[str, str],
    speaker_timelines: dict[str, list[Interval]],
) -> str:
    """Render participant and speaker timelines side-by-side for debugging.

    Each row is the slice between two consecutive interval boundaries
    (drawn from both sides). A filled cell marks an active participant
    (left block) or speaker (right block) during that slice, so vertical
    alignment makes overlap visually obvious.
    """
    participant_ids = sorted(participant_timelines.keys())
    speaker_labels = sorted(speaker_timelines.keys())

    if not participant_ids and not speaker_labels:
        return "(no timelines)"

    boundaries: set[float] = set()
    for intervals in (*participant_timelines.values(), *speaker_timelines.values()):
        for iv in intervals:
            boundaries.add(iv.start)
            boundaries.add(iv.end)
    sorted_boundaries = sorted(boundaries)
    if len(sorted_boundaries) < 2:
        return "(no intervals)"

    p_headers = [participant_names.get(pid, pid) for pid in participant_ids]
    s_headers = list(speaker_labels)
    p_widths = [max(len(h), 3) for h in p_headers]
    s_widths = [max(len(h), 3) for h in s_headers]

    def _active(intervals: list[Interval], lo: float, hi: float) -> bool:
        mid = (lo + hi) / 2
        return any(iv.start <= mid < iv.end for iv in intervals)

    def _cells(
        intervals_list: list[list[Interval]],
        widths: list[int],
        lo: float,
        hi: float,
    ) -> str:
        return " ".join(
            ("█" * w if _active(iv, lo, hi) else "·" * w)
            for iv, w in zip(intervals_list, widths, strict=True)
        )

    p_iv_list = [participant_timelines[pid] for pid in participant_ids]
    s_iv_list = [speaker_timelines[sl] for sl in speaker_labels]

    time_col = "[   start →      end]"
    p_hdr = (
        " ".join(h.center(w) for h, w in zip(p_headers, p_widths, strict=True))
        or "(none)"
    )
    s_hdr = (
        " ".join(h.center(w) for h, w in zip(s_headers, s_widths, strict=True))
        or "(none)"
    )
    sep = "  ||  "
    lines = [
        f"{time_col}  {p_hdr}{sep}{s_hdr}",
        "-" * (len(time_col) + 2 + len(p_hdr) + len(sep) + len(s_hdr)),
    ]
    for lo, hi in zip(sorted_boundaries, sorted_boundaries[1:], strict=False):
        time_str = f"[{lo:8.2f} → {hi:8.2f}]"
        p_row = _cells(p_iv_list, p_widths, lo, hi) or " " * len(p_hdr)
        s_row = _cells(s_iv_list, s_widths, lo, hi) or " " * len(s_hdr)
        lines.append(f"{time_str}  {p_row}{sep}{s_row}")
    return "\n".join(lines)


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
        ts = datetime.fromisoformat(event["timestamp"]).timestamp() - ref_epoch
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


def _build_speaker_timelines(transcription: Any) -> dict[str, list[Interval]]:
    """Build interval timelines from WhisperX transcription segments."""
    intervals: dict[str, list[Interval]] = {}
    segments = transcription.segments if hasattr(transcription, "segments") else []
    max_word_duration = settings.resolve_speaker_identities_max_word_duration

    for segment in segments:
        speaker = segment.get("speaker")
        if speaker is None:
            continue

        words = [
            w
            for w in segment.get("words", [])
            if w.get("start") is not None and w.get("end") is not None
        ]
        if not words:
            intervals.setdefault(speaker, []).append(
                Interval(segment["start"], segment["end"])
            )
            continue

        start_time: float | None = segment["start"]
        for word in words:
            if start_time is None:
                start_time = word["start"]
            if not settings.resolve_speaker_identities_enable_split_on_words:
                continue
            if word["end"] - word["start"] > max_word_duration:
                end_time = word["start"] + max_word_duration
                if end_time > start_time:
                    intervals.setdefault(speaker, []).append(
                        Interval(start_time, end_time)
                    )
                start_time = None

        if start_time is not None:
            last = words[-1]
            end_time = min(last["end"], last["start"] + max_word_duration)
            if end_time > start_time:
                intervals.setdefault(speaker, []).append(Interval(start_time, end_time))

    for speaker, speaker_intervals in intervals.items():
        intervals[speaker] = _merge_intervals(speaker_intervals)
    return intervals


def resolve_speaker_identities(
    metadata: dict[str, Any],
    transcription: Any,
    recording_start_datetime: datetime,
    recording_end_datetime: datetime,
    overlap_threshold: float = settings.resolve_speaker_identities_default_overlap_threshold,  # noqa: E501
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
        "Assignment inputs: %d participants, %d speakers\n%s\n%s\n%s",
        len(participant_timelines),
        len(speaker_timelines),
        participant_timelines,
        speaker_timelines,
        _format_timelines_debug(
            participant_timelines, participant_names, speaker_timelines
        ),
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
