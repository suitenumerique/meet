"""Privacy helpers for observability."""

from urllib.parse import urlsplit, urlunsplit


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
