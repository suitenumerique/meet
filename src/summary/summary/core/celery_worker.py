"""Celery workers."""

import json
import os
import tempfile
from pathlib import Path

import openai
import sentry_sdk
from celery import Celery, signals
from celery.utils.log import get_task_logger
from minio import Minio
from requests import Session
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from summary.core.config import get_settings
from summary.core.prompt import get_instructions

settings = get_settings()

logger = get_task_logger(__name__)

celery = Celery(
    __name__,
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    broker_connection_retry_on_startup=True,
)

if settings.sentry_dsn and settings.sentry_is_enabled:

    @signals.celeryd_init.connect
    def init_sentry(**_kwargs):
        """Initialize sentry."""
        sentry_sdk.init(dsn=settings.sentry_dsn, enable_tracing=True)


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


def format_segments(transcription_data):
    """Format transcription segments from WhisperX into a readable conversation format.

    Processes transcription data with segments containing speaker information and text,
    combining consecutive segments from the same speaker and formatting them as a
    conversation with speaker labels.
    """
    formatted_output = ""
    if not transcription_data or not hasattr(transcription_data, 'segments'):
        if isinstance(transcription_data, dict) and 'segments' in transcription_data:
            segments = transcription_data['segments']
        else:
            return "Error: Invalid transcription data format"
    else:
        segments = transcription_data.segments

    previous_speaker = None

    for segment in segments:
        speaker = segment.get('speaker', 'UNKNOWN_SPEAKER')
        text = segment.get('text', '')
        if text:
            if speaker != previous_speaker:
                formatted_output += f"\n {speaker}: {text}"
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


@celery.task(max_retries=settings.celery_max_retries)
def process_audio_transcribe_summarize(filename: str, email: str, sub: str):
    """Process an audio file by transcribing it and generating a summary.

    This Celery task performs the following operations:
    1. Retrieves the audio file from MinIO storage
    2. Transcribes the audio using OpenAI-compliant API's ASR model
    3. Generates a summary of the transcription using OpenAI-compliant API's LLM
    4. Sends the results via webhook
    """
    logger.info("Notification received")
    logger.debug("filename: %s", filename)

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
    logger.debug("Recording successfully downloaded, filepath: %s", temp_file_path)

    logger.debug("Initiating OpenAI client")
    openai_client = openai.OpenAI(
        api_key=settings.openai_api_key, base_url=settings.openai_base_url
    )

    try:
        logger.debug("Querying transcription …")
        with open(temp_file_path, "rb") as audio_file:
            transcription = openai_client.audio.transcriptions.create(
                model=settings.openai_asr_model, file=audio_file
            )

            transcription = transcription.text

            logger.debug("Transcription: \n %s", transcription)
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            logger.debug("Temporary file removed: %s", temp_file_path)

    instructions = get_instructions(transcription)
    summary_response = openai_client.chat.completions.create(
        model=settings.openai_llm_model, messages=instructions
    )

    summary = summary_response.choices[0].message.content
    logger.debug("Summary: \n %s", summary)

    # fixme - generate a title using LLM
    data = {
        "title": "Votre résumé",
        "content": summary,
        "email": email,
        "sub": sub,
    }

    logger.debug("Submitting webhook to %s", settings.webhook_url)
    logger.debug("Request payload: %s", json.dumps(data, indent=2))

    response = post_with_retries(settings.webhook_url, data)

    logger.info("Webhook submitted successfully. Status: %s", response.status_code)
    logger.debug("Response body: %s", response.text)


@celery.task(max_retries=settings.celery_max_retries)
def process_audio_transcribe_summarize_v2(filename: str, email: str, sub: str):
    """Process an audio file by transcribing it and generating a summary.

    This Celery task performs the following operations:
    1. Retrieves the audio file from MinIO storage
    2. Transcribes the audio using WhisperX model
    3. Sends the results via webhook

    """
    logger.info("Notification received")
    logger.debug("filename: %s", filename)

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
    logger.debug("Recording successfully downloaded, filepath: %s", temp_file_path)

    logger.debug("Initiating OpenAI client")
    openai_client = openai.OpenAI(
        api_key=settings.openai_api_key, base_url=settings.openai_base_url
    )

    try:
        logger.debug("Querying transcription …")
        with open(temp_file_path, "rb") as audio_file:
            transcription = openai_client.audio.transcriptions.create(
                model=settings.openai_asr_model, file=audio_file
            )

            logger.debug("Transcription: \n %s", transcription)
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            logger.debug("Temporary file removed: %s", temp_file_path)

    formatted_transcription = format_segments(transcription)

    data = {
        "title": "Transcription",
        "content": formatted_transcription,
        "email": email,
        "sub": sub,
    }

    logger.debug("Submitting webhook to %s", settings.webhook_url)
    logger.debug("Request payload: %s", json.dumps(data, indent=2))

    response = post_with_retries(settings.webhook_url, data)

    logger.info("Webhook submitted successfully. Status: %s", response.status_code)
    logger.debug("Response body: %s", response.text)

    # TODO - integrate summarize the transcript and create a new document.


