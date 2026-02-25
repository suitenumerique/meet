"""German locale strings."""

from summary.core.locales.strings import LocaleStrings

STRINGS = LocaleStrings(
    empty_transcription="""
**In Ihrer Transkription wurde kein Audioinhalt erkannt.**

*Wenn Sie glauben, dass es sich um einen Fehler handelt, zögern Sie nicht,
unseren technischen Support zu kontaktieren: visio@numerique.gouv.fr*

.

.

.

Einige Punkte, die wir Ihnen empfehlen zu überprüfen:
- War ein Mikrofon aktiviert?
- Waren Sie nah genug am Mikrofon?
- Ist das Mikrofon von guter Qualität?
- Dauert die Aufnahme länger als 30 Sekunden?

""",
    download_header_template=(
        "\n*Laden Sie Ihre Aufnahme herunter, "
        "indem Sie [diesem Link folgen]({download_link})*\n"
    ),
    hallucination_replacement_text="[Text konnte nicht transkribiert werden]",
    document_default_title="Transkription",
    document_title_template=(
        'Besprechung "{room}" am {room_recording_date} um {room_recording_time}'
    ),
)
