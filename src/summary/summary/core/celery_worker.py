"""Celery workers."""

# ruff: noqa: PLR0913

import json
import time
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import requests
import sentry_sdk
from celery import Celery, signals
from celery.utils.log import get_task_logger
from openai.types.audio import Transcription
from requests import exceptions

from summary.core.analytics import MetadataManager, get_analytics
from summary.core.config import get_settings
from summary.core.file_service import (
    FileService,
    FileServiceException,
    TranscribeError,
)
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
from summary.core.user_assign import resolve_speaker_identities
from summary.core.webhook_service import (
    call_webhook_v2,
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
    recording_filename: str | None = None,
    language: str,
    cloud_storage_url=None,
    raises: bool = False,
):
    """Transcribe an audio file using WhisperX.

    Downloads the audio from MinIO or a cloud storage URL, sends it to
    WhisperX for transcription, and tracks metadata throughout the process.

    Returns the transcription object, or None if the file could not be retrieved.
    """
    if bool(recording_filename) == bool(cloud_storage_url):
        raise ValueError(
            "Either filename or cloud_storage_url must be provided, but not both."
        )

    logger.info("Initiating WhisperX client")

    # Transcription
    try:
        with file_service.prepare_audio_file(
            remote_object_key=recording_filename,
            cloud_storage_url=cloud_storage_url,
        ) as (audio_file, metadata):
            metadata_manager.track(task_id, {"audio_length": metadata["duration"]})

            # Compute language parameter
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

            # Call remote service for transcription
            transcription_start_time = time.time()

            api_key = settings.whisperx_api_key.get_secret_value()
            base_url = settings.whisperx_base_url

            # We use a manual call to the transcripion endpoint, and we do not
            # directly use the OpenAI lib for this.
            # This is because, depending on the requested response format,
            # the OpenAI lib will cast the response to a different dataclass,
            # which can result in stripping out keys & data that we are interested in.
            # This is in particular true for word_segments and words.
            # WhisperX response is slightly different from OpenAI STT endpoints
            # response.
            # At the same time "diarized_json" should be the value
            # provided to STT endpoints in our context.
            url = urljoin(base_url.rstrip("/") + "/", "audio/transcriptions")
            res = requests.post(
                url,
                data={
                    "model": settings.whisperx_asr_model,
                    "language": language,
                    "timestamp_granularities": ["word", "segment"],
                    "response_format": "diarized_json",
                },
                files={"file": audio_file},
                headers={"Authorization": f"Bearer {api_key}"},
                # Mimic OpenAI's timeout settings
                timeout=(60, 10 * 60),
            )
            try:
                res.raise_for_status()
            except requests.exceptions.HTTPError as e:
                raise RuntimeError("WhisperX transcription failed, %s", res.text) from e

            transcription_json: dict[str, Any] = res.json()
            # We remove the "usage" key from the transcription_json dictionary
            # as it may cause issues with parsing inside the Transcription model
            # Some API don't share the exact same structure for the "usage" key
            transcription_json.pop("usage", None)

            # We force the use of the Transcription model here
            # to avoid changing too much code for now.
            # Note that it should be WhisperXResponse instead.
            transcription = Transcription.model_validate(
                # We add a dummy "text" to make the model validate,
                # Some API responses lack the "text" key.
                {"text": "", **transcription_json},
                extra="allow",
                strict=False,
            )

            # Logging
            transcription_duration = round(time.time() - transcription_start_time, 2)
            metadata_manager.track(
                task_id,
                {"transcription_time": transcription_duration},
            )
            logger.info(
                "Transcription received in %.2f seconds.", transcription_duration
            )
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
            recording_filename,
            redacted_cloud_storage_url,
        )
        return None

    metadata_manager.track_transcription_metadata(task_id, transcription)
    return transcription


def resolve_speaker_identities_and_apply_to(
    transcription, recording_start_at, recording_end_at, metadata_filename, task_id
):
    """Assign users to detected speakers and rewrite the transcriptions.

    Args:
        transcription: output of meet-whisperx after transcription and diarization
        recording_start_at: sourced from LiveKit FileInfo via the egress_ended webhook
        recording_end_at: sourced from LiveKit FileInfo via the egress_ended webhook
        metadata_filename: name of metadata file containing VAD information in S3
        task_id: current task id, for logging purposes
    """
    recording_start_dt = (
        datetime.fromisoformat(recording_start_at) if recording_start_at else None
    )
    recording_end_dt = (
        datetime.fromisoformat(recording_end_at) if recording_end_at else None
    )

    logger.debug(
        "recording_start_dt: %s ; recording_end_dt: %s",
        recording_start_dt,
        recording_end_dt,
    )
    if (recording_start_dt is None) or (recording_end_dt is None):
        logger.debug("Skipping resolve_speaker_identities")
        return transcription

    logger.debug("Running resolve_speaker_identities")
    try:
        metadata = file_service.read_json(metadata_filename)
        speaker_mapping = resolve_speaker_identities(
            metadata,
            transcription,
            recording_start_dt,
            recording_end_dt,
        )
        new_transcription = speaker_mapping.apply_to(transcription.model_dump())
        return new_transcription

    except FileServiceException as exc:
        logger.error(
            "Error reading metadata for task %s; skipping speaker assignment."
            " Error: %s",
            task_id,
            exc,
        )
        return transcription

    except Exception as exc:
        logger.exception(
            "resolve_speaker_identities failed for task %s; skipping"
            " speaker assignment. Error: %s",
            task_id,
            exc,
        )
        return transcription


def format_transcript(
    transcription,
    context_language: str | None,
    language: str,
    room: str | None,
    recording_datetime: str | None,
    owner_timezone: str | None,
    download_link: str | None,
    form_link: str | None,
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
        recording_datetime=recording_datetime,
        owner_timezone=owner_timezone,
        download_link=download_link,
        form_link=form_link,
    )


def format_actions(llm_output: dict) -> str:
    """Format the actions from the LLM output into a markdown list.

    format:
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

    try:
        transcription_res = WhisperXResponse(
            **transcribe_audio(  # type: ignore
                task_id=job_id,
                cloud_storage_url=payload.cloud_storage_url,
                language=payload.language,
                raises=True,
            ).model_dump()
        )
    except TranscribeError as e:
        failure_payload = TranscribeWebhookFailurePayload(
            job_id=job_id,
            error_code=e.error_code,
        )
        call_webhook_v2_task.apply_async(
            args=[failure_payload.model_dump(), payload.tenant_id]
        )
        return failure_payload.model_dump()

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
    n_retries_left = sender.max_retries - sender.request.retries - 1
    if n_retries_left > 0:
        logger.info(
            "Transcribe task %s failed, %s retries left.",
            task_id,
            n_retries_left,
        )
    else:
        logger.warn(
            "Transcribe task %s failed, no more retries left, sending failure webhook.",
            task_id,
        )
        call_webhook_v2_task.apply_async(
            args=[
                TranscribeWebhookFailurePayload(
                    job_id=task_id,
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
    n_retries_left = sender.max_retries - sender.request.retries - 1
    if n_retries_left > 0:
        logger.info(
            "Summary task %s failed, %s retries left.",
            task_id,
            n_retries_left,
        )
    else:
        logger.warn(
            "Summary task %s failed, no more retries left, sending failure webhook.",
            task_id,
        )
        call_webhook_v2_task.apply_async(
            args=[
                SummarizeWebhookFailurePayload(
                    job_id=task_id,
                    error_code="unknown_error",
                ).model_dump(),
                args[0]["tenant_id"],
            ]
        )
