"""
Core application enums declaration
"""
import re

from django.conf import global_settings, settings
from django.utils.translation import gettext_lazy as _


UUID_REGEX = (
    r"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"
)
FILE_EXT_REGEX = r"\.[a-zA-Z0-9]{1,10}"
RECORDING_FOLDER = 'recordings'
RECORDING_STORAGE_URL_PATTERN = re.compile(
    f"/media/recordings/(?P<recording>{UUID_REGEX:s})(?P<extension>{FILE_EXT_REGEX:s})"
)


# Django sets `LANGUAGES` by default with all supported languages. We can use it for
# the choice of languages which should not be limited to the few languages active in
# the app.
# pylint: disable=no-member
ALL_LANGUAGES = getattr(
    settings,
    "ALL_LANGUAGES",
    [(language, _(name)) for language, name in global_settings.LANGUAGES],
)
