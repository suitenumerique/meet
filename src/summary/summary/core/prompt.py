# ruff: noqa


def get_instructions(transcript):
    """Declare the summarize instructions."""
    prompt = f"""
    Audience: Coworkers.

    **Do:**
    - Detect the language of the transcript and provide your entire response in the same language.
    - If any part of the transcript is unclear or lacks detail, politely inform the user, specifying which areas need further clarification.
    - Ensure the accuracy of all information and refrain from adding unverified details.
    - Format the response using proper markdown and structured sections.
    - Be concise and avoid repeating yourself between the sections.
    - Be super precise on nickname
    - Be a nit-picker
    - Auto-evaluate your response

    **Don't:**
    - Write something your are not sure.
    - Write something that is not mention in the transcript.
    - Don't make mistake while mentioning someone
    **Task:**
    Summarize the provided meeting transcript into clear and well-organized meeting minutes. The summary should be structured into the following sections, excluding irrelevant or inapplicable details:

    1. **Summary**: Write a  TL;DR of the meeting.
    2. **Subjects Discussed**: List the key points or issues in bullet points.
    4. **Next Steps**: Provide action items as bullet points, assigning each task to a responsible individual and including deadlines (if mentioned). Format action items as tickable checkboxes. Ensure every action is assigned and, if a deadline is provided, that it is clearly stated.

    **Transcript**:  
    {transcript}

    **Response:**

    ### Summary [Translate this title based on the transcript’s language]
    [Provide a brief overview of the key points discussed]

    ### Subjects Discussed [Translate this title based on the transcript’s language]
    - [Summarize each topic concisely]

    ### Next Steps [Translate this title based on the transcript’s language]  
    - [ ] Action item [Assign to the responsible individual(s) and include a deadline if applicable, follow this strict format: Action - List of owner(s), deadline.]

    """

    return [
        {
            "role": "system",
            "content": "You are a concise and structured assistant, that summarizes meeting transcripts.",
        },
        {"role": "user", "content": prompt},
    ]


PROMPT_SYSTEM_TLDR = """Tu es un agent dont le rôle est de créer un TL;DR (résumé très concis) d'un compte rendu de réunion. Tu utilisera un style synthétique administratif, à la troisième personne, sans affect. Tu recevras en entrée le transcript. Ta tâche est de rédiger un résumé concis et structuré, en te concentrant uniquement sur les informations essentielles et pertinentes. Tu répondras en un paragraphe structuré (3 à 6 phrases), sans rien ajouter d'autre. Tu répondras dans le format suivant sans rien ajouter d'autre:
### Résumé TL;DR

[Résumé concis et structuré]"""

PROMPT_SYSTEM_PLAN = """Ta tâche est de diviser le contenu du transcript en sujets concrets correspondant aux grands axes discutés durant la réunion. Ne crée pas de catégories génériques. Les titres doivent être courts, précis et représentatifs des échanges. Veille à ce que chaque sujet soit distinct et qu’aucun thème ne soit répété. Tu te limitera à 5 ou 6 sujets maximum.
L'introducion, ordre du jour, conclusion etc seront rajoutés a posteriori. Tu répondra dans le format suivant sans rien ajouter d'autre:
"Titre du sujet 1
Titre du sujet 2
Titre du sujet 3
..."
"""

PROMPT_SYSTEM_PART = """Tu es un agent dont le rôle est de créer une partie du résumé d'un compte rendu de réunion. Tu utilisera un style synthétique administratif, à la troisième personne, sans affect. Tu recevras en entrée le transcript, et le titre du sujet correspondant. Ta tâche est de rédiger un résumé concis de cette partie et uniquement cette partie, en te concentrant uniquement sur les informations essentielles et pertinentes. Le résumé de chaque partie doit tenir en 4 à 6 phrases maximum, sans entrer dans les détails mineurs. Tu répondra dans le format suivant :
    ### Titre du sujet [Traduire ce titre selon la langue du transcript]
    [Résumé concis et structuré de la partie du transcript]
    """

PROMPT_USER_PART = """Titre de la partie à résumer : {part}

Transcript complet :
{transcript}"""

PROMPT_SYSTEM_CLEANING = """Tu es un agent dont le rôle est de nettoyer un résumé de compte rendu de réunion. Tu recevras en entrée le résumé brut, potentiellement avec des erreurs de formatage, des incohérences ou des redondances. Ta tâche est de corriger les erreurs de formatage, d'améliorer la clarté et la cohérence du texte, et de t'assurer que le résumé est bien structuré et facile à lire. Ton but principal est de retirer les redondances et les répétitions. Assure la cohérence entre les titres, et homogénéise le style d’écriture entre les parties. Supprime les doublons d’informations entre les parties si présents. Si certaines parties sont plus secondaires, tu peux les fusionner ou les réduire en 1 à 2 phrases. Mets en avant les points centraux qui ont fait l’objet de décisions ou d’actions. Tu répondra uniquement avec le résumé sans rien ajouter d'autre"""

PROMPT_SYSTEM_NEXT_STEP = """Tu es un agent dont le rôle est d'extraire les prochaines étapes d'un transcript de réunion. Tu utilisera un style synthétique administratif, à la troisième personne, sans affect. Tu recevras en entrée le transcript. Ta tâche est d'identifier et lister toutes les actions à entreprendre, en indiquant la ou les personnes assignées et en précisant les échéances si elles sont mentionnées. Ne retiens que les actions concrètes et à venir. Ignore les remarques générales ou les constats sans suite. Les actions doivent suivre ce format strict :
### Prochaines étapes

- [ ] [Action à effectuer] Assignée à : [Nom], Échéance : [Date si mentionnée]"""
