"""API routes related to application tasks (V2 / tenant friendly)."""

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException

from summary.core.celery_worker import (
    process_audio_transcribe_v2_task,
    summarize_v2_task,
)
from summary.core.config import AuthorizedTenant
from summary.core.models import SummarizeTaskV2Request, TranscribeTaskV2Request
from summary.core.security import verify_tenant_api_key_v2

router_tasks_v2 = APIRouter()


@router_tasks_v2.post("/async-jobs/transcribe")
async def create_transcribe_task_v2(
    request: TranscribeTaskV2Request,
    request_tenant: AuthorizedTenant = Depends(verify_tenant_api_key_v2),
):
    """Create a transcription task."""
    task = process_audio_transcribe_v2_task.apply_async(
        args=[{**request.model_dump(), "tenant_id": request_tenant.id}]
    )

    return {"job_id": task.id, "message": "Transcribe job created"}


@router_tasks_v2.post("/async-jobs/summarize")
async def create_summarize_task_v2(
    request: SummarizeTaskV2Request,
    request_tenant: AuthorizedTenant = Depends(verify_tenant_api_key_v2),
):
    """Create a summarization task."""
    task = summarize_v2_task.apply_async(
        args=[{**request.model_dump(), "tenant_id": request_tenant.id}]
    )

    return {"job_id": task.id, "message": "Summarize job created"}


@router_tasks_v2.get("/async-jobs/transcribe/{job_id}")
@router_tasks_v2.get("/async-jobs/summarize/{job_id}")
async def get_task_status(
    job_id: str,
    request_tenant: AuthorizedTenant = Depends(verify_tenant_api_key_v2),
):
    """Check task status by ID."""
    task = AsyncResult(job_id)
    try:
        if (
            isinstance(task.args, (list, tuple))
            and len(task.args) > 0
            and isinstance(task.args[0], dict)
            and task.args[0].get("tenant_id") == request_tenant.id
        ):
            return {"job_id": job_id, "status": task.status}
    except (TypeError, KeyError):
        pass
    raise HTTPException(status_code=404, detail="Not found")
