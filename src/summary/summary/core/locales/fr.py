"""French locale strings (default)."""

from summary.core.locales.strings import LocaleStrings

STRINGS = LocaleStrings(
    empty_transcription="""
**Aucun contenu audio n'a été détecté dans votre transcription.**

*Si vous pensez qu'il s'agit d'une erreur, n'hésitez pas à contacter
notre support technique : visio@numerique.gouv.fr*

.

.

.

Quelques points que nous vous conseillons de vérifier :
- Un micro était-il activé ?
- Étiez-vous suffisamment proche ?
- Le micro est-il de bonne qualité ?
- L'enregistrement dure-t-il plus de 30 secondes ?

""",
    download_header_template=(
        "\n*Télécharger votre enregistrement en [suivant ce lien]({download_link})*\n"
    ),
    hallucination_replacement_text="[Texte impossible à transcrire]",
    document_default_title="Transcription",
    document_title_template=(
        'Réunion "{room}" du {room_recording_date} à {room_recording_time}'
    ),
)
