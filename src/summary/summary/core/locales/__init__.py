"""Locale support for the summary service."""

from typing import Optional

from summary.core.config import get_settings
from summary.core.locales import de, en, fr, nl
from summary.core.locales.strings import LocaleStrings

_LOCALES = {"fr": fr, "en": en, "de": de, "nl": nl}


def get_locale(user_language: Optional[str] = None) -> LocaleStrings:
    """Return locale strings for the given language code, defaulting to French."""
    module = _LOCALES.get(
        user_language, _LOCALES[get_settings().default_additional_text_language]
    )
    return module.STRINGS
