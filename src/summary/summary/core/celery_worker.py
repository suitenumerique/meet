"""Celery workers."""

# ruff: noqa: PLR0913

import json
import os
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import openai
import pandas as pd
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
    PROMPT_SYSTEM_CLEANING,
    PROMPT_SYSTEM_NEXT_STEP,
    PROMPT_SYSTEM_PART,
    PROMPT_SYSTEM_PLAN,
    PROMPT_SYSTEM_TLDR,
    PROMPT_USER_PART,
)


def nanoseconds_to_seconds(nanoseconds: int) -> float:
    """Convert nanoseconds timestamp to seconds since epoch."""
    return nanoseconds / 1_000_000_000


def parse_iso_timestamp(iso_string: str) -> float:
    """Convert ISO timestamp to seconds since epoch."""
    dt = datetime.fromisoformat(iso_string.replace("+00:00", ""))
    return dt.timestamp()


def calculate_overlap_vectorized(starts1, ends1, starts2, ends2):
    """Calculate overlap duration between two sets of time intervals (vectorized)."""
    overlap_starts = np.maximum(starts1[:, None], starts2)
    overlap_ends = np.minimum(ends1[:, None], ends2)
    return np.maximum(0, overlap_ends - overlap_starts)


def build_speech_segments_df(events: List[Dict[str, Any]]) -> pd.DataFrame:
    """Build speech segments DataFrame from events.

    Returns: DataFrame with columns [participant_id, start_time, end_time]
    """
    df = pd.DataFrame(events)
    df["timestamp"] = df["timestamp"].apply(parse_iso_timestamp)

    starts = df[df["type"] == "speech_start"][["participant_id", "timestamp"]]
    ends = df[df["type"] == "speech_end"][["participant_id", "timestamp"]]

    starts = starts.sort_values("timestamp").reset_index(drop=True)
    ends = ends.sort_values("timestamp").reset_index(drop=True)

    segments = pd.merge(
        starts.rename(columns={"timestamp": "start_time"}),
        ends.rename(columns={"timestamp": "end_time"}),
        left_index=True,
        right_index=True,
        suffixes=("_start", "_end"),
    )

    segments = segments[
        segments["participant_id_start"] == segments["participant_id_end"]
    ]
    segments = segments.rename(columns={"participant_id_start": "participant_id"})
    segments = segments[["participant_id", "start_time", "end_time"]]
    return segments


def assign_participant_ids(  # noqa: PLR0912
    diarization_output: Dict[str, Any],
    metadatas: List[Dict[str, Any]],
    recording_metadata: Dict[str, Any],
    overlap_threshold: float = 0.3,
) -> Dict[str, Any]:
    """Assign participant IDs to WhisperX diarization speakers."""
    recording_start = nanoseconds_to_seconds(recording_metadata["started_at"])

    participant_segments_df = build_speech_segments_df(metadatas.get("events"))

    if participant_segments_df.empty:
        return {}

    words_df = pd.DataFrame(diarization_output)

    if words_df.empty:
        return {}
    words_df = words_df.dropna(subset=["start", "end"])

    if words_df.empty:
        return {}

    if "speaker" not in words_df.columns:
        words_df["speaker"] = "UNKNOWN"
    words_df["speaker"] = words_df["speaker"].fillna("UNKNOWN")

    words_df["abs_start"] = recording_start + words_df["start"]
    words_df["abs_end"] = recording_start + words_df["end"]
    speaker_segments_list = []

    for speaker, group in words_df.groupby("speaker"):
        grp = group.sort_values("abs_start").reset_index(drop=True)
        segments = []
        current_start = grp.iloc[0]["abs_start"]
        current_end = grp.iloc[0]["abs_end"]

        for idx in range(1, len(grp)):
            if grp.iloc[idx]["abs_start"] - current_end < 1.0:
                current_end = grp.iloc[idx]["abs_end"]
            else:
                segments.append(
                    {
                        "speaker": speaker,
                        "start_time": current_start,
                        "end_time": current_end,
                    }
                )
                current_start = grp.iloc[idx]["abs_start"]
                current_end = grp.iloc[idx]["abs_end"]

        segments.append(
            {"speaker": speaker, "start_time": current_start, "end_time": current_end}
        )
        speaker_segments_list.extend(segments)

    speaker_segments_df = pd.DataFrame(speaker_segments_list)

    speaker_to_participant = {}

    for speaker in speaker_segments_df["speaker"].unique():
        spk_segs = speaker_segments_df[speaker_segments_df["speaker"] == speaker]

        best_match = None
        best_overlap = 0

        for participant_id in participant_segments_df["participant_id"].unique():
            part_segs = participant_segments_df[
                participant_segments_df["participant_id"] == participant_id
            ]

            overlaps = calculate_overlap_vectorized(
                spk_segs["start_time"].values,
                spk_segs["end_time"].values,
                part_segs["start_time"].values,
                part_segs["end_time"].values,
            )

            total_overlap = overlaps.sum()
            total_speaker_duration = (
                spk_segs["end_time"] - spk_segs["start_time"]
            ).sum()

            if total_speaker_duration > 0:
                overlap_ratio = total_overlap / total_speaker_duration

                if overlap_ratio > best_overlap and overlap_ratio >= overlap_threshold:
                    best_overlap = overlap_ratio
                    best_match = participant_id

        speaker_to_participant[speaker] = {
            "participant_id": best_match,
            "confidence": best_overlap,
        }
    for speaker, mapping in speaker_to_participant.items():
        for participant in metadatas.get("participants", []):
            if participant["participantId"] == mapping["participant_id"]:
                speaker_to_participant[speaker] = participant["name"]
                if mapping["confidence"] < overlap_threshold + 0.2:
                    speaker_to_participant[speaker] += "?"
                logger.info(speaker, "->", speaker_to_participant[speaker], "conf:", mapping["confidence"])
                break

    return speaker_to_participant


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


class LLMException(Exception):
    """LLM call failed."""


class LLMService:
    """Service for performing calls to the LLM configured in the settings."""

    def __init__(self):
        """Init the LLMService once."""
        self._client = openai.OpenAI(
            base_url=settings.llm_base_url, api_key=settings.llm_api_key
        )

    def call(self, system_prompt: str, user_prompt: str):
        """Call the LLM service.

        Takes a system prompt and a user prompt, and returns the LLM's response
        Returns None if the call fails.
        """
        try:
            response = self._client.chat.completions.create(
                model=settings.llm_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error("LLM call failed: %s", e)
            raise LLMException("LLM call failed.") from e


def format_segments(transcription_data, metadata=None, manifest=None):
    """Format transcription segments from WhisperX into a readable conversation format.

    Processes transcription data with segments containing speaker information and text,
    combining consecutive segments from the same speaker and formatting them as a
    conversation with speaker labels.
    """
    formatted_output = ""
    logger.info("Formatting segments with metadata: %s", metadata)
    logger.info("Transcription data: %s", transcription_data)
    if metadata:
        mapping = assign_participant_ids(
            diarization_output=transcription_data,
            metadatas=metadata,
            recording_metadata=manifest,
            overlap_threshold=0.3,
        )
        logger.info("Speaker to participant mapping: %s", mapping)
        previous_label = None
        for segment in transcription_data:
            spk = segment.get("speaker") or "UNKNOWN_SPEAKER"
            text = segment.get("text") or ""
            if not text:
                continue

            label = mapping.get(spk) or spk

            if label != previous_label:
                formatted_output += f"\n\n **{label}**: {text}"
            else:
                formatted_output += f" {text}"
            previous_label = label

        return formatted_output
    else:
        previous_speaker = None

    for segment in transcription_data:
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


@signals.task_prerun.connect
def task_started(task_id=None, task=None, args=None, **kwargs):
    """Signal handler called before task execution begins."""
    task_args = args or []
    metadata_manager.create(task_id, task_args)


@signals.task_retry.connect
def task_retry_handler(request=None, reason=None, einfo=None, **kwargs):
    """Signal handler called when task execution retries."""
    metadata_manager.retry(request.id)


@signals.task_failure.connect
def task_failure_handler(task_id, exception=None, **kwargs):
    """Signal handler called when task execution fails permanently."""
    metadata_manager.capture(task_id, settings.posthog_event_failure)


@celery.task(
    bind=True,
    autoretry_for=[exceptions.HTTPError],
    max_retries=settings.celery_max_retries,
    queue=settings.transcribe_queue,
)
def process_audio_transcribe_summarize_v2(  # noqa: PLR0915
    self,
    filename: str,
    email: str,
    sub: str,
    received_at: float,
    room: Optional[str],
    recording_date: Optional[str],
    recording_time: Optional[str],
    worker_id: Optional[str],
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
                model=settings.whisperx_asr_model, file=audio_file
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

    if not (
        analytics.is_feature_enabled("is_metadata_agent_enabled", distinct_id=sub)
        and settings.is_summary_enabled
    ):
        file = filename.split("/")[1].split(".")[0]
        metadata_obj = minio_client.get_object(
            settings.aws_storage_bucket_name,
            object_name=settings.metadata_file.format(filename=file),
        )

        file_manifest = "recordings/" + worker_id + ".json"
        manifest_obj = minio_client.get_object(
            settings.aws_storage_bucket_name,
            object_name=file_manifest,
        )
        logger.info("Manifest file downloaded: %s", file_manifest)

        logger.info("Downloading metadata file")

        try:
            metadata_bytes = metadata_obj.read()
            metadata_json = json.loads(metadata_bytes.decode("utf-8"))
            manifest_bytes = manifest_obj.read()
            manifest_json = json.loads(manifest_bytes.decode("utf-8"))
        finally:
            metadata_obj.close()
            metadata_obj.release_conn()
            manifest_obj.close()
            manifest_obj.release_conn()

        logger.info("Metadata file successfully downloaded")
        logger.debug("Manifest: %s", manifest_json)
        formatted_transcription = (
            DEFAULT_EMPTY_TRANSCRIPTION
            if not getattr(transcription, "segments", None)
            else format_segments(transcription.segments, metadata_json, manifest_json)
        )
    else:
        formatted_transcription = (
            DEFAULT_EMPTY_TRANSCRIPTION
            if not transcription.segments
            else format_segments(transcription.segments, None)
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
        analytics.is_feature_enabled("summary-enabled", distinct_id=sub)
        and settings.is_summary_enabled
    ):
        logger.info("Queuing summary generation task.")
        summarize_transcription.apply_async(
            args=[formatted_transcription, email, sub, title],
            queue=settings.summarize_queue,
        )
    else:
        logger.info("Summary generation not enabled for this user.")
        summarize_transcription.apply_async(
            args=[formatted_transcription, email, sub, title],
            queue=settings.summarize_queue,
        )


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

    tldr = llm_service.call(PROMPT_SYSTEM_TLDR, transcript)

    logger.info("TLDR generated")

    parts = llm_service.call(PROMPT_SYSTEM_PLAN, transcript)
    logger.info("Plan generated")

    parts = parts.split("\n")
    parts = [x for x in parts if x.strip() != ""]
    logger.info("Empty parts removed")

    parts_summarized = []
    for part in parts:
        prompt_user_part = PROMPT_USER_PART.format(part=part, transcript=transcript)
        logger.info("Summarizing part: %s", part)
        parts_summarized.append(llm_service.call(PROMPT_SYSTEM_PART, prompt_user_part))

    logger.info("Parts summarized")

    raw_summary = "\n\n".join(parts_summarized)

    next_steps = llm_service.call(PROMPT_SYSTEM_NEXT_STEP, transcript)
    logger.info("Next steps generated")

    cleaned_summary = llm_service.call(PROMPT_SYSTEM_CLEANING, raw_summary)
    logger.info("Summary cleaned")

    summary = tldr + "\n\n" + cleaned_summary + "\n\n" + next_steps

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
