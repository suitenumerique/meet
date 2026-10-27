"""Sentry configuration."""

import re

import sentry_sdk
from sentry_sdk.scrubber import DEFAULT_DENYLIST, DEFAULT_PII_DENYLIST, EventScrubber

from summary.core.config import get_settings
from summary.core.privacy import redact_url

# Exact names (case-insensitive) of variables and dict keys to redact.
SENSITIVE_DATA_DENYLIST = [
    # Raw payloads and serialized bodies
    "data",
    "body",
    "payload",
    "args",
    "kwargs",
    "response",
    "res",
    # Transcripts
    "transcript",
    "transcription",
    "transcription_json",
    "transcription_res",
    "new_transcription",
    "segments",
    "word_segments",
    "words",
    "text",
    "content",
    "formatted_output",
    # Summaries and LLM exchanges
    "summary",
    "raw_summary",
    "cleaned_summary",
    "tldr",
    "part",
    "parts",
    "parts_summarized",
    "next_steps",
    "title",
    "titles",
    "action",
    "line",
    "lines",
    "user_prompt",
    "prompt_user_part",
    "messages",
    "json_data",  # OpenAI client internals
    "opts",
    "options",
    "input_options",
    # Participants' personal data
    "email",
    "user_email",
    "assignees",
    "participant_name",
    "participant_names",
    "participants_info",
    "speaker_to_name",
    # Signed / pre-authenticated URLs
    "cloud_storage_url",
    "transcription_data_url",
    "summary_data_url",
]


def build_event_scrubber() -> EventScrubber:
    """Build the scrubber redacting meeting content and personal data."""
    return EventScrubber(
        denylist=DEFAULT_DENYLIST + SENSITIVE_DATA_DENYLIST,
        pii_denylist=DEFAULT_PII_DENYLIST,
        recursive=True,
    )


def init_sentry() -> None:
    """Initialize Sentry if enabled in the settings."""
    settings = get_settings()

    if not settings.sentry_is_enabled:
        return

    if not settings.sentry_dsn:
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # Never attach request bodies, Celery task arguments or user data.
        send_default_pii=False,
        # Task creation requests carry the content to summarize.
        max_request_body_size="never",
        include_local_variables=True,
        before_send=before_send,
        before_send_transaction=before_send,
        before_breadcrumb=before_breadcrumb,
        event_scrubber=build_event_scrubber(),
    )


def _scrub_strings(value):
    """Remove URL credentials, queries and fragments throughout an event."""
    if isinstance(value, str):
        return re.sub(
            r"https?://[^\s\"'<>]+",
            lambda m: redact_url(m.group()),
            value,
            flags=re.IGNORECASE,
        )
    if isinstance(value, dict):
        return {key: _scrub_strings(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_scrub_strings(item) for item in value]
    return value


def before_send(event, hint):
    """Keep exception types and stacks, but discard untrusted message text."""
    del hint
    event.pop("message", None)
    event.pop("logentry", None)
    request = event.get("request", {})
    request.pop("data", None)
    request.pop("query_string", None)
    for exception in event.get("exception", {}).get("values", []):
        exception["value"] = "[Filtered]"
    return _scrub_strings(event)


def before_breadcrumb(crumb, hint):
    """Drop arbitrary breadcrumb text and scrub URLs in structured data."""
    del hint
    crumb.pop("message", None)
    crumb.pop("data", None)
    return _scrub_strings(crumb)
