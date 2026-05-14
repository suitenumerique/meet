import logging
from datetime import datetime
from urllib.parse import urljoin

from django.conf import settings
from django.utils import timezone

import requests

from core import analytics, models
from core.models import (
    AiJobStatusChoices,
    AiJobTypeChoices,
    AiRecordingJob,
    Recording,
)
from core.tasks._task import task
from core.transcription.locales import get_locale
from core.transcription.transcript_formatter import TranscriptFormatter
from core.transcription.webhook_schemas import WhisperXResponse
from core.utils import generate_download_s3_file_url

logger = logging.getLogger(__name__)


@task
def call_transcribe_service(recording_id):
    """
    Call the transcribe service for a given recording.
    """
    try:
        recording = Recording.objects.get(id=recording_id)
    except Recording.DoesNotExist:
        logger.error("Recoding %s does not exist", recording_id)
        return None

    owner_access = (
        models.RecordingAccess.objects.select_related("user")
        .filter(
            role=models.RoleChoices.OWNER,
            recording_id=recording.id,
        )
        .first()
    )

    if not owner_access:
        logger.error("No owner found for recording %s", recording.id)
        return False

    metadata = None
    if (
        settings.METADATA_COLLECTOR_ENABLED
        and recording.options.get("collect_metadata", False)
        and recording.started_at
        and recording.ended_at
    ):
        output_folder = settings.METADATA_COLLECTOR_OUTPUT_FOLDER
        metadata_filename = f"{output_folder}/{recording.id}-metadata.json"
        metadata = {
            "cloud_storage_url": generate_download_s3_file_url(metadata_filename),
            "start_at": recording.started_at,
            "end_at": recording.ended_at,
        }

    language = (
        recording.options.get("language") or settings.TRANSCRIPTION_DEFAULT_LANGUAGE
    )
    ai_transcribe_job = AiRecordingJob.objects.create(
        remote_job_id=None,
        recording=recording,
        type=AiJobTypeChoices.TRANSCRIPT,
        status=AiJobStatusChoices.PENDING,
        language=language,
    )

    try:
        response = requests.post(
            settings.AI_SERVICE_URL + "async-jobs/transcribe/",
            json={
                "user_sub": owner_access.user.sub,
                "language": language,
                "cloud_storage_url": generate_download_s3_file_url(
                    recording.key, expires_in=60 * 60 * 24, override_domain=False
                ),
                "metadata": metadata,
            },
            headers={
                "Authorization": f"Bearer {settings.AI_SERVICE_API_KEY}",
            },
            timeout=10,
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(
            "Creating transcription job failed for recording %s: %s", recording_id, e
        )
        ai_transcribe_job.status = AiJobStatusChoices.FAILED
        ai_transcribe_job.save()
        raise e

    data = response.json()

    ai_transcribe_job.remote_job_id = data["job_id"]
    ai_transcribe_job.save()

    recording.status = models.RecordingStatusChoices.NOTIFICATION_SUCCEEDED
    recording.save()

    logger.info("Transcription job created for recording %s", recording_id)
    return ai_transcribe_job.id


def format_transcript(  # noqa: PLR0913
    transcription,
    *,
    context_language: str | None,
    language: str,
    room: str | None,
    recording_datetime: datetime | None,
    owner_timezone: str | None,
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
        recording_datetime=recording_datetime,
        owner_timezone=owner_timezone,
        download_link=download_link,
    )


@task
def handle_transcript_received(remote_job_id, url):
    """
    Store the transcript and call the summarize service for a given recording.
    """
    ai_transcript_job = AiRecordingJob.objects.filter(
        remote_job_id=remote_job_id, type=AiJobTypeChoices.TRANSCRIPT
    ).first()
    if not ai_transcript_job:
        logger.warning("No AI recording job found for job ID: %s", remote_job_id)
        return

    user = ai_transcript_job.user
    recording = ai_transcript_job.recording

    response = requests.get(url, timeout=(10, 20))
    response.raise_for_status()
    transcript = WhisperXResponse(**response.json())

    # Format output
    content, title = format_transcript(
        transcript,
        context_language=user.language,
        language=ai_transcript_job.language,
        room=recording.room.name,
        recording_datetime=recording.started_at or recording.created_at,
        owner_timezone=user.timezone,
        download_link=urljoin(settings.RECORDING_DOWNLOAD_BASE_URL, recording.id),
    )

    create_document_in_docs(
        title=title, content=content, email=user.email, sub=user.sub
    )

    ai_transcript_job.status = AiJobStatusChoices.SUCCESS
    ai_transcript_job.save()

    analytics.capture_event(
        analytics.EventName.TRANSCRIPT_GENERATION_SUCCESS,
        user=ai_transcript_job.user,
        properties={
            "generation_time_seconds": (
                timezone.now() - ai_transcript_job.created_at
            ).total_seconds(),
            "ai_recording_job_id": ai_transcript_job.id,
            "language": ai_transcript_job.language,
            "recording_id": ai_transcript_job.recording.id,
            "transcript_size": len(response.content),
        },
    )

    # LLM Summarization
    if analytics.is_feature_enabled("summary-enabled", distinct_id=user.sub):
        ai_summary_job = AiRecordingJob.objects.create(
            remote_job_id=None,
            file=recording,
            type=AiJobTypeChoices.SUMMARIZE,
            status=AiJobStatusChoices.PENDING,
            language=ai_transcript_job.language,
        )

        try:
            summary_response = requests.post(
                settings.AI_SERVICE_URL + "async-jobs/summarize/",
                json={
                    "user_sub": ai_summary_job.user.sub,
                    "language": ai_transcript_job.language,
                    "content": content,
                },
                headers={
                    "Authorization": f"Bearer {settings.AI_SERVICE_API_KEY}",
                },
                timeout=10,
            )
            summary_response.raise_for_status()
        except Exception as e:
            logger.error(
                "Creating summary job failed for recording %s: %s", recording.id, e
            )
            ai_summary_job.status = AiJobStatusChoices.FAILED
            ai_summary_job.save()
            raise e

        ai_summary_job.remote_job_id = summary_response.json()["job_id"]
        ai_summary_job.save()

        logger.info("Summary job created for recording %s", recording.id)


@task
def handle_summary_received(remote_job_id, url):
    """
    Store the summary of a given file.
    """
    ai_summary_job = AiRecordingJob.objects.filter(
        remote_job_id=remote_job_id, type=AiJobTypeChoices.SUMMARIZE
    ).first()
    if not ai_summary_job:
        logger.warning("No AI file job found for job ID: %s", remote_job_id)
        return

    recording = ai_summary_job.recording

    logger.info("Storing summary for recording %s & url %s", recording.id, url)
    response = requests.get(url, timeout=(10, 20))
    response.raise_for_status()

    user = ai_summary_job.user

    # We dynamically recompute the title for the document since we don't have access to the transcript
    _, title = format_transcript(
        None,
        context_language=user.language,
        language=ai_summary_job.language,
        room=recording.room.name,
        recording_datetime=recording.started_at or recording.created_at,
        owner_timezone=user.timezone,
        download_link=urljoin(settings.RECORDING_DOWNLOAD_BASE_URL, recording.id),
    )

    create_document_in_docs(
        title=get_locale(user.language).summary_title_template.format(title=title),
        content=response.text,
        email=user.email,
        sub=user.sub,
    )

    logger.info("Summary created in docs for recording %s & url %s", recording.id, url)
    ai_summary_job.status = AiJobStatusChoices.SUCCESS
    ai_summary_job.save()

    analytics.capture_event(
        analytics.EventName.TRANSCRIPT_GENERATION_SUCCESS,
        user=ai_summary_job.user,
        properties={
            "generation_time_seconds": (
                timezone.now() - ai_summary_job.created_at
            ).total_seconds(),
            "ai_recording_job_id": ai_summary_job.id,
            "language": ai_summary_job.language,
            "recording_id": ai_summary_job.recording.id,
            "transcript_size": len(response.content),
        },
    )


def create_document_in_docs(*, title: str, content: str, email: str, sub: str) -> str:
    """
    Create a document in Docs for a given file.
    """

    response = requests.post(
        urljoin(settings.DOCS_BASE_URL, "/api/v1.0/documents/create-for-owner/"),
        json={
            "title": title,
            "content": content,
            "email": email,
            "sub": sub,
        },
        headers={
            "Authorization": f"Bearer {settings.DOCS_SERVER_TO_SERVER_API_KEY}",
        },
        timeout=20,
    )

    if response.status_code != 201:
        logger.error(
            "Failed to create document in Docs %s",
            title,
        )
        response.raise_for_status()

    docs_app_id = response.json()["id"]
    logger.info(
        "Document created in Docs => %s (in docs)",
        docs_app_id,
    )
    return docs_app_id
