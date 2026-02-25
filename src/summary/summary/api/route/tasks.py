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
    filename: str
    email: str
    sub: str
    version: Optional[int] = 2
    room: Optional[str]
    recording_date: Optional[str]
    recording_time: Optional[str]
    language: Optional[str]
    download_link: Optional[str]
    context_language: Optional[str] = None

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


router = APIRouter(prefix="/tasks")


@router.post("/")
async def create_transcribe_summarize_task(request: TranscribeSummarizeTaskCreation):
    """Create a transcription and summarization task."""
    task = process_audio_transcribe_summarize_v2.apply_async(
        args=[
            request.owner_id,
            request.filename,
            request.email,
            request.sub,
            time.time(),
            request.room,
            request.recording_date,
            request.recording_time,
            request.language,
            request.download_link,
            request.context_language,
        ],
        queue=settings.transcribe_queue,
    )

    return {"id": task.id, "message": "Task created"}


@router.get("/{task_id}")
async def get_task_status(task_id: str):
    """Check task status by ID."""
    task = AsyncResult(task_id)
    return {"id": task_id, "status": task.status}
