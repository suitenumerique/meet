"""API routes related to application tasks (V2 / tenant friendly)."""

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, Request

from summary.core.celery_worker import (
    celery,
    process_audio_transcribe_v2_task,
    summarize_v2_task,
)
from summary.core.config import AuthorizedTenant
from summary.core.models import SummarizeTaskV2Request, TranscribeTaskV2Request
from summary.core.security import verify_tenant_api_key_v2
from summary.core.shared_models import (
    SummarizeWebhookFailurePayload,
    SummarizeWebhookPendingPayload,
    SummarizeWebhookSuccessPayload,
    TranscribeWebhookFailurePayload,
    TranscribeWebhookPendingPayload,
    TranscribeWebhookSuccessPayload,
)

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

    return TranscribeWebhookPendingPayload(job_id=task.id).model_dump()


@router_tasks_v2.post("/async-jobs/summarize")
async def create_summarize_task_v2(
    request: SummarizeTaskV2Request,
    request_tenant: AuthorizedTenant = Depends(verify_tenant_api_key_v2),
):
    """Create a summarization task."""
    task = summarize_v2_task.apply_async(
        args=[{**request.model_dump(), "tenant_id": request_tenant.id}]
    )

    return SummarizeWebhookPendingPayload(job_id=task.id).model_dump()


@router_tasks_v2.get("/async-jobs/transcribe/{job_id}")
async def get_transcribe_job_status(
    job_id: str,
    request: Request,
    request_tenant: AuthorizedTenant = Depends(verify_tenant_api_key_v2),
):
    """Check transcription task status by ID."""
    # We have to look directly in Redis to check if the task exists
    redis_client = celery.backend.client
    key = f"celery-task-meta-{job_id}"
    if not redis_client.exists(key):
        raise HTTPException(status_code=404, detail="Not found")

    task = AsyncResult(job_id, app=celery)
    task_tenant_id = task.args[0]["tenant_id"]
    if task_tenant_id != request_tenant.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if task.status == "SUCCESS":
        result = task.result
        return TranscribeWebhookSuccessPayload.model_validate(result).model_dump()

    if task.status == "FAILURE":
        return TranscribeWebhookFailurePayload(
            job_id=job_id, error_code="unknown_error"
        ).model_dump()

    return TranscribeWebhookPendingPayload(job_id=job_id).model_dump()


@router_tasks_v2.get("/async-jobs/summarize/{job_id}")
async def get_summarize_job_status(
    job_id: str,
    request: Request,
    request_tenant: AuthorizedTenant = Depends(verify_tenant_api_key_v2),
):
    """Check summarize task status by ID."""
    # We have to look directly in Redis to check if the task exists
    redis_client = celery.backend.client
    key = f"celery-task-meta-{job_id}"
    if not redis_client.exists(key):
        raise HTTPException(status_code=404, detail="Not found")

    task = AsyncResult(job_id, app=celery)
    task_tenant_id = task.args[0]["tenant_id"]
    if task_tenant_id != request_tenant.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if task.status == "SUCCESS":
        result = task.result
        return SummarizeWebhookSuccessPayload.model_validate(result).model_dump()

    if task.status == "FAILURE":
        return SummarizeWebhookFailurePayload(
            job_id=job_id, error_code="unknown_error"
        ).model_dump()

    return SummarizeWebhookPendingPayload(job_id=job_id).model_dump()
