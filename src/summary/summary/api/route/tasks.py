"""API routes related to application tasks."""

from typing import Optional

from celery.result import AsyncResult
from fastapi import APIRouter
from pydantic import BaseModel

from summary.core.celery_worker import (
    process_audio_transcribe_summarize,
    process_audio_transcribe_summarize_v2,
)


class TaskCreation(BaseModel):
    """Task data."""

    filename: str
    email: str
    sub: str
    version: Optional[int] = 2


router = APIRouter(prefix="/tasks")


@router.post("/")
async def create_task(request: TaskCreation):
    """Create a task."""
    if request.version == 1:
        task = process_audio_transcribe_summarize.delay(
            request.filename, request.email, request.sub
        )
    else:
        task = process_audio_transcribe_summarize_v2.delay(
            request.filename, request.email, request.sub
        )

    return {"id": task.id, "message": "Task created"}


@router.get("/{task_id}")
async def get_task_status(task_id: str):
    """Check task status by ID."""
    task = AsyncResult(task_id)
    return {"id": task_id, "status": task.status}
