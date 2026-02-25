"""Celery workers."""

# ruff: noqa: PLR0913

import json
import time
from typing import Optional

import openai
import sentry_sdk
from celery import Celery, signals
from celery.utils.log import get_task_logger
from requests import Session, exceptions
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from summary.core.analytics import MetadataManager, get_analytics
from summary.core.config import get_settings
from summary.core.file_service import FileService, FileServiceException
from summary.core.llm_service import LLMException, LLMObservability, LLMService
from summary.core.locales import get_locale
from summary.core.prompt import (
    FORMAT_NEXT_STEPS,
    FORMAT_PLAN,
    PROMPT_SYSTEM_CLEANING,
    PROMPT_SYSTEM_NEXT_STEP,
    PROMPT_SYSTEM_PART,
    PROMPT_SYSTEM_PLAN,
    PROMPT_SYSTEM_TLDR,
    PROMPT_USER_PART,
)
from summary.core.transcript_formatter import TranscriptFormatter

settings = get_settings()
analytics = get_analytics()

metadata_manager = MetadataManager()

logger = get_task_logger(__name__)


celery = Celery(
    __name__,
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    broker_connection_retry_on_startup=True,
)

celery.config_from_object("summary.core.celery_config")

if settings.sentry_dsn and settings.sentry_is_enabled:

    @signals.celeryd_init.connect
    def init_sentry(**_kwargs):
        """Initialize sentry."""
        sentry_sdk.init(dsn=settings.sentry_dsn, enable_tracing=True)


file_service = FileService(logger=logger)


def create_retry_session():
    """Create an HTTP session configured with retry logic."""
    session = Session()
    retries = Retry(
        total=settings.webhook_max_retries,
        backoff_factor=settings.webhook_backoff_factor,
        status_forcelist=settings.webhook_status_forcelist,
        allowed_methods={"POST"},
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


def format_actions(llm_output: dict) -> str:
    """Format the actions from the LLM output into a markdown list.

    fomat:
    - [ ] Action title Assignée à : assignee1, assignee2, Échéance : due_date
    """
    lines = []
    for action in llm_output.get("actions", []):
        title = action.get("title", "").strip()
        assignees = ", ".join(action.get("assignees", [])) or "-"
        due_date = action.get("due_date") or "-"
        line = f"- [ ] {title} Assignée à : {assignees}, Échéance : {due_date}"
        lines.append(line)
    if lines:
        return "### Prochaines étapes\n\n" + "\n".join(lines)
    return ""


def post_with_retries(url, data):
    """Send POST request with automatic retries."""
    session = create_retry_session()
    session.headers.update(
        {"Authorization": f"Bearer {settings.webhook_api_token.get_secret_value()}"}
    )
    try:
        response = session.post(url, json=data)
        response.raise_for_status()
        return response
    finally:
        session.close()


@celery.task(
    bind=True,
    autoretry_for=[exceptions.HTTPError],
    max_retries=settings.celery_max_retries,
    queue=settings.transcribe_queue,
)
def process_audio_transcribe_summarize_v2(
    self,
    owner_id: str,
    filename: str,
    email: str,
    sub: str,
    received_at: float,
    room: Optional[str],
    recording_date: Optional[str],
    recording_time: Optional[str],
    language: Optional[str],
    download_link: Optional[str],
    context_language: Optional[str] = None,
):
    """Process an audio file by transcribing it and generating a summary.

    This Celery task performs the following operations:
    1. Retrieves the audio file from MinIO storage
    2. Transcribes the audio using WhisperX model
    3. Sends the results via webhook

    Args:
        self: Celery task instance (passed on with bind=True)
        owner_id: Unique identifier of the recording owner.
        filename: Name of the audio file in MinIO storage.
        email: Email address of the recording owner.
        sub: OIDC subject identifier of the recording owner.
        received_at: Unix timestamp when the recording was received.
        room: room name where the recording took place.
        recording_date: Date of the recording (localized display string).
        recording_time: Time of the recording (localized display string).
        language: ISO 639-1 language code for transcription.
        download_link: URL to download the original recording.
        context_language: ISO 639-1 language code of the meeting summary context text.
    """
    logger.info(
        "Notification received | Owner: %s | Room: %s",
        owner_id,
        room,
    )

    task_id = self.request.id

    logger.info("Initiating WhisperX client")
    whisperx_client = openai.OpenAI(
        api_key=settings.whisperx_api_key.get_secret_value(),
        base_url=settings.whisperx_base_url,
        max_retries=settings.whisperx_max_retries,
    )

    # Transcription
    try:
        with (
            file_service.prepare_audio_file(filename) as (audio_file, metadata),
        ):
            metadata_manager.track(task_id, {"audio_length": metadata["duration"]})

            if language is None:
                language = settings.whisperx_default_language
                logger.info(
                    "No language specified, using default from settings: %s",
                    (language or "auto-detect"),
                )
            else:
                logger.info(
                    "Querying transcription in '%s' language",
                    language,
                )

            transcription_start_time = time.time()

            transcription = whisperx_client.audio.transcriptions.create(
                model=settings.whisperx_asr_model, file=audio_file, language=language
            )

            transcription_time = round(time.time() - transcription_start_time, 2)
            metadata_manager.track(
                task_id,
                {"transcription_time": transcription_time},
            )
            logger.info("Transcription received in %.2f seconds.", transcription_time)
            logger.debug("Transcription: \n %s", transcription)

    except FileServiceException:
        logger.exception("Unexpected error for filename: %s", filename)
        return

    metadata_manager.track_transcription_metadata(task_id, transcription)

    # For locale of context, use in decreasing priority context_language,
    # language (of meeting), default context language
    locale = get_locale(context_language, language)
    formatter = TranscriptFormatter(locale)

    content, title = formatter.format(
        transcription,
        room=room,
        recording_date=recording_date,
        recording_time=recording_time,
        download_link=download_link,
    )

    data = {
        "title": title,
        "content": content,
        "email": email,
        "sub": sub,
    }

    logger.debug("Submitting webhook to %s", settings.webhook_url)
    logger.debug("Request payload: %s", json.dumps(data, indent=2))

    response = post_with_retries(settings.webhook_url, data)

    try:
        response_data = response.json()
        document_id = response_data.get("id", "N/A")
    except (json.JSONDecodeError, AttributeError):
        document_id = "Unable to parse response"
        response_data = response.text

    logger.info(
        "Webhook success | Document %s submitted (HTTP %s)",
        document_id,
        response.status_code,
    )
    logger.debug("Full response: %s", response_data)

    metadata_manager.capture(task_id, settings.posthog_event_success)

    # LLM Summarization
    if (
        analytics.is_feature_enabled("summary-enabled", distinct_id=owner_id)
        and settings.is_summary_enabled
    ):
        logger.info("Queuing summary generation task.")
        summarize_transcription.apply_async(
            args=[owner_id, content, email, sub, title],
            queue=settings.summarize_queue,
        )
    else:
        logger.info("Summary generation not enabled for this user. Skipping.")


@signals.task_prerun.connect(sender=process_audio_transcribe_summarize_v2)
def task_started(task_id=None, task=None, args=None, **kwargs):
    """Signal handler called before task execution begins."""
    task_args = args or []
    metadata_manager.create(task_id, task_args)


@signals.task_retry.connect(sender=process_audio_transcribe_summarize_v2)
def task_retry_handler(request=None, reason=None, einfo=None, **kwargs):
    """Signal handler called when task execution retries."""
    metadata_manager.retry(request.id)


@signals.task_failure.connect(sender=process_audio_transcribe_summarize_v2)
def task_failure_handler(task_id, exception=None, **kwargs):
    """Signal handler called when task execution fails permanently."""
    metadata_manager.capture(task_id, settings.posthog_event_failure)


@celery.task(
    bind=True,
    autoretry_for=[LLMException, Exception],
    max_retries=settings.celery_max_retries,
    queue=settings.summarize_queue,
)
def summarize_transcription(
    self, owner_id: str, transcript: str, email: str, sub: str, title: str
):
    """Generate a summary from the provided transcription text.

    This Celery task performs the following operations:
    1. Uses an LLM to generate a TL;DR summary of the transcription.
    2. Breaks the transcription into parts and summarizes each part.
    3. Cleans up the combined summary
    4. Generates next steps.
    5. Sends the final summary via webhook.
    """
    logger.info(
        "Starting summarization task | Owner: %s",
        owner_id,
    )

    user_has_tracing_consent = analytics.is_feature_enabled(
        "summary-tracing-consent", distinct_id=owner_id
    )

    # NOTE: We must instantiate a new LLMObservability client for each task invocation
    # because the masking function needs to be user-specific. The masking function is
    # baked into the Langfuse client at initialization time, so we can't reuse
    # a singleton client. This is a performance trade-off we accept to ensure per-user
    # privacy controls in observability traces.
    llm_observability = LLMObservability(
        logger=logger,
        user_has_tracing_consent=user_has_tracing_consent,
        session_id=self.request.id,
        user_id=owner_id,
    )
    llm_service = LLMService(llm_observability=llm_observability, logger=logger)

    tldr = llm_service.call(PROMPT_SYSTEM_TLDR, transcript, name="tldr")

    logger.info("TLDR generated")

    parts = llm_service.call(
        PROMPT_SYSTEM_PLAN, transcript, name="parts", response_format=FORMAT_PLAN
    )
    logger.info("Plan generated")

    res = json.loads(parts)
    parts = res.get("titles", [])
    logger.info("Parts to summarize: %s", parts)
    parts_summarized = []
    for part in parts:
        prompt_user_part = PROMPT_USER_PART.format(part=part, transcript=transcript)
        logger.info("Summarizing part: %s", part)
        parts_summarized.append(
            llm_service.call(PROMPT_SYSTEM_PART, prompt_user_part, name="part")
        )

    logger.info("Parts summarized")

    raw_summary = "\n\n".join(parts_summarized)

    next_steps = llm_service.call(
        PROMPT_SYSTEM_NEXT_STEP,
        transcript,
        name="next-steps",
        response_format=FORMAT_NEXT_STEPS,
    )

    next_steps = format_actions(json.loads(next_steps))

    logger.info("Next steps generated")

    cleaned_summary = llm_service.call(
        PROMPT_SYSTEM_CLEANING, raw_summary, name="cleaning"
    )
    logger.info("Summary cleaned")

    summary = tldr + "\n\n" + cleaned_summary + "\n\n" + next_steps

    data = {
        "title": settings.summary_title_template.format(title=title),
        "content": summary,
        "email": email,
        "sub": sub,
    }

    logger.debug("Submitting webhook to %s", settings.webhook_url)

    response = post_with_retries(settings.webhook_url, data)

    logger.info("Webhook submitted successfully. Status: %s", response.status_code)
    logger.debug("Response body: %s", response.text)

    llm_observability.flush()
    logger.debug("LLM observability flushed")
