"""Dutch locale strings."""

from summary.core.locales.strings import LocaleStrings

STRINGS = LocaleStrings(
    empty_transcription="""
**Er is geen audio-inhoud gedetecteerd in uw transcriptie.**

*Als u denkt dat dit een fout is, aarzel dan niet om contact op te nemen
met onze technische ondersteuning: visio@numerique.gouv.fr*

.

.

.

Een paar punten die wij u aanraden te controleren:
- Was er een microfoon ingeschakeld?
- Was u dicht genoeg bij de microfoon?
- Is de microfoon van goede kwaliteit?
- Duurt de opname langer dan 30 seconden?

""",
    download_header_template=(
        "\n*Download uw opname door [deze link te volgen]({download_link})*\n"
    ),
    hallucination_replacement_text="[Tekst kon niet worden getranscribeerd]",
    document_default_title="Transcriptie",
    document_title_template=(
        'Vergadering "{room}" op {room_recording_date} om {room_recording_time}'
    ),
)
