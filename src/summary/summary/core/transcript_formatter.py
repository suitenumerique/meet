"""Transcript formatting into readable conversation format with speaker labels."""

import logging
from typing import Optional, Tuple

from summary.core.config import get_settings

settings = get_settings()

logger = logging.getLogger(__name__)


DEFAULT_EMPTY_TRANSCRIPTION = """
**Aucun contenu audio n’a été détecté dans votre transcription.**


*Si vous pensez qu’il s’agit d’une erreur, n’hésitez pas à contacter
notre support technique : visio@numerique.gouv.fr*

.

.

.

Quelques points que nous vous conseillons de vérifier :
- Un micro était-il activé ?
- Étiez-vous suffisamment proche ?
- Le micro est-il de bonne qualité ?
- L’enregistrement dure-t-il plus de 30 secondes ?

"""


class TranscriptFormatter:
    """Formats WhisperX transcription output into readable conversation format.

    Handles:
    - Extracting segments from transcription objects or dictionaries
    - Combining consecutive segments from the same speaker
    - Removing hallucination patterns from content
    - Generating descriptive titles from context
    """

    def __init__(self):
        """Initialize formatter with settings."""
        self.hallucination_patterns = settings.hallucination_patterns
        self.hallucination_replacement_text = settings.hallucination_replacement_text
        self.default_title = settings.document_default_title
        self.default_empty_transcription = DEFAULT_EMPTY_TRANSCRIPTION

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
            content = self.default_empty_transcription
        else:
            content = self._format_speaker(segments)
            content = self._remove_hallucinations(content)
            content = self._add_header(content, download_link)

        title = self._generate_title(room, recording_date, recording_time)

        return content, title

    def _remove_hallucinations(self, content: str) -> str:
        """Remove hallucination patterns from content."""
        replacement = self.hallucination_replacement_text or ""

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

        header = (
            f"\n*Télécharger votre enregistrement "
            f"en [suivant ce lien]({download_link})*\n"
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
            return self.default_title

        return settings.document_title_template.format(
            room=room,
            room_recording_date=recording_date,
            room_recording_time=recording_time,
        )
