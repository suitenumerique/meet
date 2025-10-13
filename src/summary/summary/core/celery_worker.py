"""Celery workers."""

# ruff: noqa: PLR0913

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Mapping, Optional
import math

import openai
import sentry_sdk
from celery import Celery, signals
from celery.utils.log import get_task_logger
from minio import Minio
from mutagen import File
from requests import Session, exceptions
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from summary.core.analytics import MetadataManager, get_analytics
from summary.core.config import get_settings
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


DEFAULT_EMPTY_TRANSCRIPTION = """
**Aucun contenu audio n’a été détecté dans votre transcription.**


*Si vous pensez qu’il s’agit d’une erreur, n’hésitez pas à contacter
notre support technique : visio@numerique.gouv.fr*

.

.

.

Quelques points que nous vous conseillons de vérifier :
- Un micro était-il activé ?
- Étiez-vous suffisamment proche ?
- Le micro est-il de bonne qualité ?
- L’enregistrement dure-t-il plus de 30 secondes ?

"""


class AudioValidationError(Exception):
    """Custom exception for audio validation errors."""

    pass


def save_audio_stream(audio_stream, chunk_size=32 * 1024):
    """Save an audio stream to a temporary OGG file."""
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
        tmp.writelines(audio_stream.stream(chunk_size))
        return Path(tmp.name)


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

def add_line_numbers(transcript: str):
    """Add line numbers to a text file."""
    lines = transcript.splitlines()
    lines = [line for line in lines if line.strip()] 
    numbered_lines = [f"{i + 1}: {line}" for i, line in enumerate(lines)]
    return "\n".join(numbered_lines)

class LLMException(Exception):
    """LLM call failed."""


class LLMService:
    """Service for performing calls to the LLM configured in the settings."""

    def __init__(self):
        """Init the LLMService once."""
        self._client = openai.OpenAI(
            base_url=settings.llm_base_url, api_key=settings.llm_api_key
        )

    def call(
        self,
        system_prompt: str,
        user_prompt: str,
        response_format: Optional[Mapping[str, Any]] = None,
    ):
        """Call the LLM service.

        Takes a system prompt and a user prompt, and returns the LLM's response
        Returns None if the call fails.
        """
        try:
            params: dict[str, Any] = {
                "model": settings.llm_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            if response_format is not None:
                params["response_format"] = response_format

            response = self._client.chat.completions.create(**params)

            return response.choices[0].message.content

        except Exception as e:
            logger.exception("LLM call failed: %s", e)
            raise LLMException("LLM call failed: {e}") from e


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


def format_segments(transcription_data):
    """Format transcription segments from WhisperX into a readable conversation format.

    Processes transcription data with segments containing speaker information and text,
    combining consecutive segments from the same speaker and formatting them as a
    conversation with speaker labels.
    """
    formatted_output = ""
    if not transcription_data or not hasattr(transcription_data, "segments"):
        if isinstance(transcription_data, dict) and "segments" in transcription_data:
            segments = transcription_data["segments"]
        else:
            return "Error: Invalid transcription data format"
    else:
        segments = transcription_data.segments

    previous_speaker = None

    for segment in segments:
        speaker = segment.get("speaker", "UNKNOWN_SPEAKER")
        text = segment.get("text", "")
        if text:
            if speaker != previous_speaker:
                formatted_output += f"\n\n **{speaker}**: {text}"
            else:
                formatted_output += f" {text}"
            previous_speaker = speaker
    return formatted_output


def post_with_retries(url, data):
    """Send POST request with automatic retries."""
    session = create_retry_session()
    session.headers.update({"Authorization": f"Bearer {settings.webhook_api_token}"})
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
):
    """Process an audio file by transcribing it and generating a summary.

    This Celery task performs the following operations:
    1. Retrieves the audio file from MinIO storage
    2. Transcribes the audio using WhisperX model
    3. Sends the results via webhook

    """
    logger.info("Notification received")
    logger.debug("filename: %s", filename)

    task_id = self.request.id

    minio_client = Minio(
        settings.aws_s3_endpoint_url,
        access_key=settings.aws_s3_access_key_id,
        secret_key=settings.aws_s3_secret_access_key,
        secure=settings.aws_s3_secure_access,
    )

    logger.debug("Connection to the Minio bucket successful")

    audio_file_stream = minio_client.get_object(
        settings.aws_storage_bucket_name, object_name=filename
    )

    temp_file_path = save_audio_stream(audio_file_stream)

    logger.info("Recording successfully downloaded")
    logger.debug("Recording filepath: %s", temp_file_path)

    audio_file = File(temp_file_path)
    metadata_manager.track(task_id, {"audio_length": audio_file.info.length})

    if (
        settings.recording_max_duration is not None
        and audio_file.info.length > settings.recording_max_duration
    ):
        error_msg = "Recording too long: %.2fs > %.2fs limit" % (
            audio_file.info.length,
            settings.recording_max_duration,
        )
        logger.error(error_msg)
        raise AudioValidationError(error_msg)

    logger.info("Initiating WhisperX client")
    whisperx_client = openai.OpenAI(
        api_key=settings.whisperx_api_key,
        base_url=settings.whisperx_base_url,
        max_retries=settings.whisperx_max_retries,
    )

    try:
        logger.info("Querying transcription …")
        transcription_start_time = time.time()
        with open(temp_file_path, "rb") as audio_file:
            transcription = whisperx_client.audio.transcriptions.create(
                model=settings.whisperx_asr_model,
                file=audio_file,
                language=settings.whisperx_default_language,
            )
            metadata_manager.track(
                task_id,
                {
                    "transcription_time": round(
                        time.time() - transcription_start_time, 2
                    )
                },
            )
            logger.info("Transcription received.")
            logger.debug("Transcription: \n %s", transcription)
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            logger.debug("Temporary file removed: %s", temp_file_path)

    formatted_transcription = (
        DEFAULT_EMPTY_TRANSCRIPTION
        if not transcription.segments
        else format_segments(transcription)
    )

    metadata_manager.track_transcription_metadata(task_id, transcription)

    if not room or not recording_date or not recording_time:
        title = settings.document_default_title
    else:
        title = settings.document_title_template.format(
            room=room,
            room_recording_date=recording_date,
            room_recording_time=recording_time,
        )
    data = {
        "title": title,
        "content": formatted_transcription,
        "email": email,
        "sub": sub,
    }

    logger.debug("Submitting webhook to %s", settings.webhook_url)
    logger.debug("Request payload: %s", json.dumps(data, indent=2))

    response = post_with_retries(settings.webhook_url, data)

    logger.info("Webhook submitted successfully. Status: %s", response.status_code)
    logger.debug("Response body: %s", response.text)

    metadata_manager.capture(task_id, settings.posthog_event_success)

    if (
        analytics.is_feature_enabled("summary-enabled", distinct_id=owner_id)
        and settings.is_summary_enabled
    ):
        logger.info("Queuing summary generation task.")
        summarize_transcription.apply_async(
            args=[formatted_transcription, email, sub, title],
            queue=settings.summarize_queue,
        )
    else:
        logger.info("Summary generation not enabled for this user.")


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
def summarize_transcription(self, transcript: str, email: str, sub: str, title: str):
    """Generate a summary from the provided transcription text.

    This Celery task performs the following operations:
    1. Uses an LLM to generate a TL;DR summary of the transcription.
    2. Breaks the transcription into parts and summarizes each part.
    3. Cleans up the combined summary
    4. Generates next steps.
    5. Sends the final summary via webhook.
    """
    logger.info("Starting summarization task")

    llm_service = LLMService()

    token_estimate = len(transcript) // 3.6
    t = round(0.5 + 2.3 * math.log1p((token_estimate / 3800) ** 2))
    nb_parts = max(1, t)

    logger.info("TLDR generated")

    transcript = add_line_numbers(transcript)

    logger.info("Transcription with line numbers: \n%s", transcript)
    parts = llm_service.call(
        PROMPT_SYSTEM_PLAN.format(nb_parts_min=nb_parts-2, nb_parts_max=nb_parts+2), "Transcript : \n" + transcript, response_format=FORMAT_PLAN
    )
    logger.info("Plan generated")

    res = json.loads(parts)
    parts = res.get("parts", [])

    logger.info("Parts to summarize: %s", parts)

    parts_titles = ""
    for part in parts:
        parts_titles += f"- {part['title']}, lignes {part['plages_lignes']}\n"

    raw_summary = llm_service.call(
        PROMPT_SYSTEM_PART,
        f"Plan:\n{parts_titles}\n\nTranscript:\n{transcript}",
    )

    logger.info("Parts summarized")

    next_steps = llm_service.call(
        PROMPT_SYSTEM_NEXT_STEP, transcript, response_format=FORMAT_NEXT_STEPS
    )

    next_steps = format_actions(json.loads(next_steps))

    logger.info("Next steps generated")

    cleaned_summary = llm_service.call(PROMPT_SYSTEM_CLEANING, raw_summary)
    logger.info("Summary cleaned")

    tldr = llm_service.call(
        PROMPT_SYSTEM_TLDR,
        "transcript :\n" + transcript + "\n\nsummary :\n" + cleaned_summary,
    )

    summary = tldr + "\n\n" + raw_summary + "\n\n" + next_steps

    data = {
        "title": settings.summary_title_template.format(
            title=title,
        ),
        "content": summary,
        "email": email,
        "sub": sub,
    }

    logger.debug("Submitting webhook to %s", settings.webhook_url)

    response = post_with_retries(settings.webhook_url, data)

    logger.info("Webhook submitted successfully. Status: %s", response.status_code)
    logger.debug("Response body: %s", response.text)
