"""Privacy helpers for observability."""

from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, SecretStr


def dump_for_transport(model: BaseModel) -> dict:
    """Reveal secrets explicitly for task messages, HTTP bodies and API responses."""

    def reveal(value):
        if isinstance(value, SecretStr):
            return value.get_secret_value()
        if isinstance(value, dict):
            return {key: reveal(item) for key, item in value.items()}
        if isinstance(value, list):
            return [reveal(item) for item in value]
        return value

    return reveal(model.model_dump())


def redact_url(url):
    """Keep the source identifiable without logging query or user credentials."""
    if not isinstance(url, str):
        return "[redacted]"
    # Remove query and fragment before parsing, including for malformed URLs.
    base, has_query, _ = url.partition("?")
    base = base.partition("#")[0]
    try:
        parts = urlsplit(base)
    except ValueError:
        return "[redacted]"
    authority = parts.netloc.rsplit("@", 1)[-1]
    redacted = urlunsplit(parts._replace(netloc=authority))
    return redacted + ("?[redacted]" if has_query else "")
