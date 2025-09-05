"""API routes related to application tasks."""

import time
from typing import Optional

from celery.result import AsyncResult
from fastapi import APIRouter
from pydantic import BaseModel
from summary.core.config import get_settings
from summary.core.celery_worker import (
    process_audio_transcribe_summarize,
    process_audio_transcribe_summarize_v2,
)

settings = get_settings()

class TaskCreation(BaseModel):
    """Task data."""

    filename: str
    email: str
    sub: str
    version: Optional[int] = 2
    room: Optional[str]
    recording_date: Optional[str]
    recording_time: Optional[str]


router = APIRouter(prefix="/tasks")


@router.post("/")
async def create_task(request: TaskCreation):
    """Create a task."""
    if request.version == 1:
        task = process_audio_transcribe_summarize.delay(
            request.filename, request.email, request.sub
        )
    else:
        task = process_audio_transcribe_summarize_v2.apply_async(
            args=[
                request.filename,
                request.email,
                request.sub,
                time.time(),
                request.room,
                request.recording_date,
                request.recording_time,
            ],           
            queue=settings.transcribe_queue,
        )

    return {"id": task.id, "message": "Task created"}


@router.get("/{task_id}")
async def get_task_status(task_id: str):
    """Check task status by ID."""
    task = AsyncResult(task_id)
    return {"id": task_id, "status": task.status}
