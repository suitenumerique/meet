"""Locale support for the summary service."""

from typing import Optional

from summary.core.config import get_settings
from summary.core.locales import de, en, fr, nl
from summary.core.locales.strings import LocaleStrings

_LOCALES = {"fr": fr, "en": en, "de": de, "nl": nl}


def get_locale(*languages: Optional[str]) -> LocaleStrings:
    """Return locale strings for the first matching language candidate.

    Accept language codes in decreasing priority order and return the
    locale for the first one that matches a known locale.
    Fall back to the configured default_context_language.
    """
    for lang in languages:
        if not lang:
            continue
        if lang in _LOCALES:
            return _LOCALES[lang].STRINGS

        # Provide fallback for longer formats of ISO 639-1 (e.g. "en-au" -> "en")
        base_lang = lang.split("-")[0]
        if base_lang in _LOCALES:
            return _LOCALES[base_lang].STRINGS

    return _LOCALES[get_settings().default_context_language].STRINGS
