"""Celery workers."""

# ruff: noqa: PLR0913

import json
import time
from typing import Optional

import openai
import sentry_sdk
from celery import Celery, signals
from celery.utils.log import get_task_logger
from requests import exceptions

from summary.core.analytics import MetadataManager, get_analytics
from summary.core.config import get_settings
from summary.core.file_service import FileService, FileServiceException
from summary.core.llm_service import LLMException, LLMObservability, LLMService
from summary.core.locales import get_locale
from summary.core.models import (
    SummarizeTaskV2Payload,
    TranscribeTaskV2Payload,
)
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
from summary.core.shared_models import (
    SummarizeWebhookFailurePayload,
    SummarizeWebhookSuccessPayload,
    TranscribeWebhookFailurePayload,
    TranscribeWebhookSuccessPayload,
    WhisperXResponse,
    webhook_payload_adapter,
)
from summary.core.transcript_formatter import TranscriptFormatter
from summary.core.webhook_service import (
    call_webhook_v2,
    submit_content,
)

settings = get_settings()
analytics = get_analytics()

metadata_manager = MetadataManager()

logger = get_task_logger(__name__)


celery = Celery(
    __name__,
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    broker_connection_retry_on_startup=True,
    # To store the tasks args too in results and make the
    # V2 API work
    result_extended=True,
)

celery.config_from_object("summary.core.celery_config")

if settings.sentry_dsn and settings.sentry_is_enabled:

    @signals.celeryd_init.connect
    def init_sentry(**_kwargs):
        """Initialize sentry."""
        sentry_sdk.init(dsn=settings.sentry_dsn, enable_tracing=True)


file_service = FileService()


def transcribe_audio(
    *,
    task_id: str,
    filename: str | None = None,
    language: str,
    cloud_storage_url=None,
    raises: bool = False,
):
    """Transcribe an audio file using WhisperX.

    Downloads the audio from MinIO or a cloud storage URL, sends it to
    WhisperX for transcription, and tracks metadata throughout the process.

    Returns the transcription object, or None if the file could not be retrieved.
    """
    if bool(filename) == bool(cloud_storage_url):
        raise ValueError(
            "Either filename or cloud_storage_url must be provided, but not both."
        )

    logger.info("Initiating WhisperX client")
    whisperx_client = openai.OpenAI(
        api_key=settings.whisperx_api_key.get_secret_value(),
        base_url=settings.whisperx_base_url,
        max_retries=settings.whisperx_max_retries,
    )

    # Transcription
    try:
        with file_service.prepare_audio_file(
            remote_object_key=filename,
            cloud_storage_url=cloud_storage_url,
        ) as (audio_file, metadata):
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

    except FileServiceException as e:
        # For v2 pipeline we want failures not silent errors like this
        if raises:
            raise e
        redacted_cloud_storage_url = (
            cloud_storage_url.split("?", 1)[0] if cloud_storage_url else None
        )
        logger.exception(
            (
                "Unexpected error while preparing file | filename: %s "
                "| cloud_storage_url: %s"
            ),
            filename,
            redacted_cloud_storage_url,
        )
        return None

    metadata_manager.track_transcription_metadata(task_id, transcription)
    return transcription


def format_transcript(
    transcription,
    context_language: str | None,
    language: str,
    room: str | None,
    recording_date: str | None,
    recording_time: str | None,
    download_link: str | None,
) -> tuple[str, str]:
    """Format a transcription into readable content with a title.

    Resolves the locale from context_language / language, then uses
    TranscriptFormatter to produce markdown content and a title.

    Returns a (content, title) tuple.
    """
    locale = get_locale(context_language, language)
    formatter = TranscriptFormatter(locale)

    return formatter.format(
        transcription,
        room=room,
        recording_date=recording_date,
        recording_time=recording_time,
        download_link=download_link,
    )


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

    This Celery task orchestrates:
    1. Audio transcription via WhisperX
    2. Transcript formatting
    3. Webhook submission
    4. Conditional summarization queuing

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

    transcription = transcribe_audio(
        task_id=task_id, filename=filename, language=language
    )
    if transcription is None:
        return

    content, title = format_transcript(
        transcription,
        context_language,
        language,
        room,
        recording_date,
        recording_time,
        download_link,
    )

    submit_content(content, title, email, sub)
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


def summarize_transcription_internals(
    *, owner_id: str, transcript: str, session_id: str
) -> str:
    """Generate a summary from the provided transcription text.

    1. Uses an LLM to generate a TL;DR summary of the transcription.
    2. Breaks the transcription into parts and summarizes each part.
    3. Cleans up the combined summary
    4. Generates next steps.
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
        user_has_tracing_consent=user_has_tracing_consent,
        session_id=session_id,
        user_id=owner_id,
    )
    llm_service = LLMService(llm_observability=llm_observability)

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

    llm_observability.flush()
    logger.debug("LLM observability flushed")

    return summary


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
    1. Run summary internals
    2. Sends the final summary via webhook.
    """
    summary = summarize_transcription_internals(
        owner_id=owner_id, transcript=transcript, session_id=self.request.id
    )
    summary_title = settings.summary_title_template.format(title=title)

    submit_content(summary, summary_title, email, sub)


##################################################################################
# Tasks v2
##################################################################################


@celery.task(
    max_retries=3,
    queue=settings.call_webhook_queue_v2,
    autoretry_for=[exceptions.HTTPError],
)
def call_webhook_v2_task(
    payload: dict,
    tenant_id: str,
):
    """Calls a webhook asynchrously (retry handled by celery)."""
    call_webhook_v2(
        payload=webhook_payload_adapter.validate_python(payload), tenant_id=tenant_id
    )


@celery.task(
    bind=True,
    autoretry_for=[exceptions.HTTPError],
    max_retries=settings.celery_max_retries,
    queue=settings.transcribe_queue_v2,
)
def process_audio_transcribe_v2_task(
    self,
    payload: dict,
):
    """Process an audio file by transcribing it.

    This Celery task orchestrates:
    1. Audio transcription via WhisperX
    2. Store transcript result on S3
    3. Webhook submission

    Args:
        self: Celery task instance (passed on with bind=True)
        payload: Serialized dictionary of TranscribeSummarizeTaskCreationV2
    """
    payload = TranscribeTaskV2Payload.model_validate(payload)
    logger.info(
        "Transcribing for object received | Owner: %s",
        payload.user_sub,
    )

    job_id = self.request.id

    transcription_res = WhisperXResponse(
        **transcribe_audio(  # type: ignore
            task_id=job_id,
            cloud_storage_url=payload.cloud_storage_url,
            language=payload.language,
            raises=True,
        ).model_dump()
    )

    file_service.store_transcript(
        transcript=transcription_res,
        job_id=job_id,
    )

    success_payload = TranscribeWebhookSuccessPayload(
        job_id=job_id,
        transcription_data_url=file_service.get_transcript_signed_url(job_id),
    )
    call_webhook_v2_task.apply_async(
        args=[success_payload.model_dump(), payload.tenant_id]
    )
    return success_payload.model_dump()


@signals.task_failure.connect(sender=process_audio_transcribe_v2_task)
def handle_transcribe_v2_failed(
    sender,
    task_id=None,
    exception=None,
    args=None,
    kwargs=None,
    traceback=None,
    einfo=None,
    **kw,
):
    """Handle the failure of transcribe_v2_task.

    This function is triggered when the transcribe_v2_task fails.
    It sends a webhook failure payload to notify the client of the failure.
    """
    task = sender
    # If retries are exhausted:
    if task.request.retries >= task.max_retries:
        call_webhook_v2_task.apply_async(
            args=[
                TranscribeWebhookFailurePayload(
                    job_id=task.id,
                    error_code="unknown_error",
                ).model_dump(),
                args[0]["tenant_id"],
            ]
        )


@celery.task(
    bind=True,
    autoretry_for=[LLMException, Exception],
    max_retries=settings.celery_max_retries,
    queue=settings.summarize_queue_v2,
)
def summarize_v2_task(
    self,
    payload: dict,
):
    """Generate a summary from the provided content.

    This Celery task performs the following operations:
    1. Run summary internals
    2. Sends the final summary via webhook.
    """
    payload = SummarizeTaskV2Payload.model_validate(payload)
    summary = summarize_transcription_internals(
        owner_id=payload.user_sub,
        transcript=payload.content,
        session_id=self.request.id,
    )
    job_id = self.request.id
    file_service.store_summary(summary=summary, job_id=job_id)

    success_payload = SummarizeWebhookSuccessPayload(
        job_id=job_id,
        summary_data_url=file_service.get_summary_signed_url(job_id),
    )
    call_webhook_v2_task.apply_async(
        args=[success_payload.model_dump(), payload.tenant_id]
    )
    return success_payload.model_dump()


@signals.task_failure.connect(sender=summarize_v2_task)
def handle_summarize_v2_failed(
    sender,
    task_id=None,
    exception=None,
    args=None,
    kwargs=None,
    traceback=None,
    einfo=None,
    **kw,
):
    """Handle the failure of summarize_v2_task.

    This function is triggered when the summarize_v2_task fails.
    It sends a webhook failure payload to notify the client of the failure.
    """
    task = sender
    # If retries are exhausted:
    if task.request.retries >= task.max_retries:
        call_webhook_v2_task.apply_async(
            args=[
                SummarizeWebhookFailurePayload(
                    job_id=task.id,
                    error_code="unknown_error",
                ).model_dump(),
                args[0]["tenant_id"],
            ]
        )
