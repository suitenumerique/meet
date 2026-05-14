"""Locale types for the summary service."""

from dataclasses import dataclass


@dataclass(frozen=True)
class LocaleStrings:
    """All translatable output strings for the summary pipeline."""

    # transcript_formatter.py
    empty_transcription: str
    download_header_template: str
    hallucination_replacement_text: str
    document_default_title: str
    document_title_template: str
