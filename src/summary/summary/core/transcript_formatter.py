"""Transcript formatting into readable conversation format with speaker labels."""

import logging
from typing import Optional, Tuple

from summary.core.config import get_settings
from summary.core.locales import LocaleStrings

settings = get_settings()

logger = logging.getLogger(__name__)


class TranscriptFormatter:
    """Formats WhisperX transcription output into readable conversation format.

    Handles:
    - Extracting segments from transcription objects or dictionaries
    - Combining consecutive segments from the same speaker
    - Removing hallucination patterns from content
    - Generating descriptive titles from context
    """

    def __init__(self, locale: LocaleStrings):
        """Initialize formatter with settings and locale."""
        self.hallucination_patterns = settings.hallucination_patterns
        self._locale = locale

    def _get_segments(self, transcription):
        """Extract segments from transcription object or dictionary."""
        if hasattr(transcription, "segments"):
            return transcription.segments

        if isinstance(transcription, dict):
            return transcription.get("segments", None)

        return None

    def format(
        self,
        transcription,
        room: Optional[str] = None,
        recording_date: Optional[str] = None,
        recording_time: Optional[str] = None,
        download_link: Optional[str] = None,
    ) -> Tuple[str, str]:
        """Format transcription into the final document and its title."""
        segments = self._get_segments(transcription)

        if not segments:
            content = self._locale.empty_transcription
        else:
            content = self._format_speaker(segments)
            content = self._remove_hallucinations(content)
            content = self._add_header(content, download_link)

        title = self._generate_title(room, recording_date, recording_time)

        return content, title

    def _remove_hallucinations(self, content: str) -> str:
        """Remove hallucination patterns from content."""
        replacement = self._locale.hallucination_replacement_text or ""

        for pattern in self.hallucination_patterns:
            content = content.replace(pattern, replacement)
        return content

    def _format_speaker(self, segments) -> str:
        """Format segments with speaker labels, combining consecutive speakers."""
        formatted_output = ""
        previous_speaker = None

        for segment in segments:
            speaker = segment.get("speaker", "UNKNOWN_SPEAKER")
            text = segment.get("text", "")
            if text:
                if speaker != previous_speaker:
                    formatted_output += f"\n\n **{speaker}**: {text}"
                else:
                    formatted_output += f" {text}"
                previous_speaker = speaker

        return formatted_output

    def _add_header(self, content, download_link: Optional[str]) -> str:
        """Add download link header to the document content."""
        if not download_link:
            return content

        header = self._locale.download_header_template.format(
            download_link=download_link
        )
        content = header + content

        return content

    def _generate_title(
        self,
        room: Optional[str] = None,
        recording_date: Optional[str] = None,
        recording_time: Optional[str] = None,
    ) -> str:
        """Generate title from context or return default."""
        if not room or not recording_date or not recording_time:
            return self._locale.document_default_title

        return self._locale.document_title_template.format(
            room=room,
            room_recording_date=recording_date,
            room_recording_time=recording_time,
        )
