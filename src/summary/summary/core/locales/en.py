"""English locale strings."""

from summary.core.locales.strings import LocaleStrings

STRINGS = LocaleStrings(
    empty_transcription="""
**No audio content was detected in your transcription.**

*If you believe this is an error, please do not hesitate to contact
our technical support: visio@numerique.gouv.fr*

.

.

.

A few things we recommend you check:
- Was a microphone enabled?
- Were you close enough to the microphone?
- Is the microphone of good quality?
- Is the recording longer than 30 seconds?

""",
    download_header_template=(
        "\n*Download your recording by [following this link]({download_link})*\n"
    ),
    hallucination_replacement_text="[Unable to transcribe text]",
    document_default_title="Transcription",
    document_title_template=(
        'Meeting "{room}" on {room_recording_date} at {room_recording_time}'
    ),
)
