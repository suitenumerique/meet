"""Sentry configuration."""

import sentry_sdk
from sentry_sdk.scrubber import DEFAULT_DENYLIST, DEFAULT_PII_DENYLIST, EventScrubber

from summary.core.config import get_settings

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
        enable_tracing=True,
        # Never attach request bodies, Celery task arguments or user data.
        send_default_pii=False,
        # Task creation requests carry the content to summarize.
        max_request_body_size="never",
        include_local_variables=True,
        event_scrubber=build_event_scrubber(),
    )
