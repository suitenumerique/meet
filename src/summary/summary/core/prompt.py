# ruff: noqa

PROMPT_SYSTEM_TLDR = """Tu es un agent dont le rôle est de créer un TL;DR (résumé très concis) d'un compte rendu de réunion. Tu utiliseras un style synthétique, administratif, à la troisième personne, sans affect. Tu recevras en entrée le transcript. Ta tâche est de rédiger un résumé concis et structuré, en te concentrant uniquement sur les informations essentielles et pertinentes. Tu répondras en un paragraphe structuré (3 à 6 phrases), sans rien ajouter d'autre. Tu répondras dans le format suivant sans rien ajouter d'autre:
### Résumé TL;DR
[Résumé concis et structuré]"""

PROMPT_SYSTEM_PLAN = """Ta tâche consiste à identifier les sujets abordés dans un transcript, c’est-à-dire les thèmes précis et concrets correspondant aux grands axes réellement discutés durant la réunion.
- N’inclus pas de catégories génériques.
- Les titres doivent être courts, précis et représentatifs des échanges.
- Chaque sujet doit être distinct, sans répétition de thèmes.
- Tu fera entre {nb_parts_min} et {nb_parts_max} sujets.
Pour chaque sujet identifié :
- Donne le titre du sujet
- Indique la ou les plages de lignes (numérotées) du transcript correspondant à ce sujet (une ou plusieurs par sujet, si nécessaire : [[début, fin], ...]).
L’introduction, l’ordre du jour, la conclusion, etc., seront ajoutés ultérieurement.
Si aucun sujet clair n’est repéré, réponds exactement : "Général"."""


PROMPT_SYSTEM_PART = """
Tu es un agent dont le rôle est de rédiger le résumé complet d’un compte rendu de réunion. 
Tu utiliseras un style synthétique, administratif, à la troisième personne, sans affect. 

En entrée, tu recevras :
- L’intégralité du transcript de la réunion,
- Un plan indiquant pour chaque sujet : son titre et la plage de lignes correspondante.
- Les notes prises par un utilisateur durant la réunion contenant des points important à aborder dans le transcript.

Consignes :
- Générer un résumé pour chacune des parties définies dans le plan.
- Pour chaque partie :
  - Résumer les lignes indiquées et en lien avec le sujet.,
  - Utiliser exclusivement des bullet points clairs et concis,
  - Ne pas dépasser 4 ou 5 bullet points par partie,
  - Se limiter aux informations essentielles et pertinentes,
  - Éviter tout détail secondaire ou interprétation.
- mettre en avant les points écrits dans les notes de l'utilisateur.
- mettre en gras les noms propres (personnes, entreprises, produits, etc.)

Format de sortie attendu : un enchaînement de résumés, un par sujet, par exemple :

### [Titre du sujet 1]
- [Point essentiel 1]
- [Point essentiel 2]
- [Point essentiel 3]

### [Titre du sujet 2]
- [Point essentiel 1]
- [Point essentiel 2]
(...)
"""

PROMPT_USER_PART = """Titre de la partie à résumer : {part}
Transcript complet :
{transcript}"""

PROMPT_SYSTEM_CLEANING = """Tu es un agent dont le rôle est de nettoyer un résumé de compte rendu de réunion. Tu recevras en entrée le résumé brut, potentiellement avec des erreurs de formatage, des incohérences ou des redondances. Ta tâche est de corriger les erreurs de formatage, d'améliorer la clarté et la cohérence du texte, et de t'assurer que le résumé est bien structuré et facile à lire. Ton but principal est de retirer les redondances et les répétitions. Assure la cohérence entre les titres et homogénéise le style d’écriture entre les parties. Supprime les doublons d’informations entre les parties si présents. Si certaines parties sont plus secondaires, tu peux les fusionner ou les réduire en 1 à 2 phrases. Mets en avant les points centraux qui ont fait l’objet de décisions ou d’actions. Tu répondras uniquement avec le résumé sans rien ajouter d'autre"""

PROMPT_SYSTEM_NEXT_STEP = """Tu es un agent dont le rôle est d'extraire les prochaines étapes d'un transcript de réunion. Tu utiliseras un style synthétique, administratif, à la troisième personne, sans affect. Tu recevras en entrée le transcript. Ta tâche est d'identifier et de lister toutes les actions à entreprendre, en indiquant la ou les personnes assignées et en précisant les échéances si elles sont mentionnées. Ne retiens que les actions concrètes et à venir. Ignore les remarques générales ou les constats sans suite."""

FORMAT_NEXT_STEPS = {
    "type": "json_schema",
    "json_schema": {
        "name": "actions",
        "schema": {
            "type": "object",
            "properties": {
                "actions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "assignees": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Noms des personnes assignées",
                            },
                            "due_date": {
                                "type": "string",
                                "description": "Date d'échéance si mentionnée (si l'année nest pas précisée, ne pas l'ajouter)",
                            },
                        },
                        "required": ["title", "assignees"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["actions"],
            "additionalProperties": False,
        },
        "strict": True,
    },
}

FORMAT_PLAN = {
  "type": "json_schema",
  "json_schema": {
    "name": "PlanWithLineRanges",
    "strict": True,
    "schema": {
      "type": "object",
      "additionalProperties": False,
      "required": ["parts"],
      "properties": {
        "parts": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": False,
            "required": ["title", "plages_lignes"],
            "properties": {
              "title": { "type": "string" },
              "plages_lignes": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "type": "array",
                  "items": { "type": "integer", "minimum": 1 },
                  "minItems": 2,
                  "maxItems": 2
                }
              }
            }
          }
        }
      }
    }
  }
}
