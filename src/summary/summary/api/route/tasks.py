"""API routes related to application tasks."""

import time
from typing import Optional

from celery.result import AsyncResult
from fastapi import APIRouter
from pydantic import BaseModel, field_validator

from summary.core.celery_worker import (
    process_audio_transcribe_summarize_v2,
)
from summary.core.config import get_settings

settings = get_settings()


class TranscribeSummarizeTaskCreation(BaseModel):
    """Transcription and summarization parameters."""

    owner_id: str
    recording_filename: str
    metadata_filename: str
    email: str
    sub: str
    version: Optional[int] = 2
    room: Optional[str]
    worker_id: Optional[str]
    owner_timezone: Optional[str]
    language: Optional[str]
    download_link: Optional[str]
    context_language: Optional[str] = None
    recording_start_at: Optional[str] = None
    recording_end_at: Optional[str] = None

    @field_validator("language")
    @classmethod
    def validate_language(cls, v):
        """Validate 'language' parameter."""
        if v is not None and v not in settings.whisperx_allowed_languages:
            raise ValueError(
                f"Language '{v}' is not allowed. "
                f"Allowed languages: {', '.join(settings.whisperx_allowed_languages)}"
            )
        return v


router_tasks_v1 = APIRouter(prefix="/tasks")


@router_tasks_v1.post("/")
async def create_transcribe_summarize_task(request: TranscribeSummarizeTaskCreation):
    """Create a transcription and summarization task."""
    task = process_audio_transcribe_summarize_v2.apply_async(
        args=[
            request.owner_id,
            request.recording_filename,
            request.metadata_filename,
            request.email,
            request.sub,
            time.time(),
            request.room,
            request.worker_id,
            request.owner_timezone,
            request.language,
            request.download_link,
            request.context_language,
            request.recording_start_at,
            request.recording_end_at,
        ],
        queue=settings.transcribe_queue,
    )

    return {"id": task.id, "message": "Task created"}


@router_tasks_v1.get("/{task_id}")
async def get_task_status(task_id: str):
    """Check task status by ID."""
    task = AsyncResult(task_id)
    return {"id": task_id, "status": task.status}
