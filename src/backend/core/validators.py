"""Custom validators for the core app."""

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _


def sub_validator(value):
    """Validate that the sub is printable ASCII only.

    OpenID Connect Core 1.0 (section 2) allows any ASCII (RFC 20) string of
    at most 255 characters, so no character whitelist is applied: providers
    legitimately emit "|" (Auth0), ":" (Keycloak), "=", "/", etc. As a
    deliberate hardening beyond the spec, ASCII control characters
    (U+0000-U+001F and U+007F) are rejected: no known provider emits them,
    NUL cannot be stored in PostgreSQL text fields, and the others invite
    log-injection and interoperability issues. For str values,
    ``isprintable()`` is false exactly for those control characters, while
    space (U+0020) remains allowed.
    """
    if not value.isascii() or not value.isprintable():
        raise ValidationError(
            _("Enter a valid sub. This value should be printable ASCII only.")
        )
