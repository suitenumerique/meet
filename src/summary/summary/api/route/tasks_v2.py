"""API routes related to application tasks (V2 / tenant friendly)."""

import logging
from datetime import datetime, timezone

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, Request, status

from summary.core.analytics import get_analytics
from summary.core.celery_worker import (
    celery,
    process_audio_transcribe_v2_task,
    summarize_v2_task,
)
from summary.core.config import AuthorizedTenant, get_settings
from summary.core.models import SummarizeTaskApiRequest, TranscribeTaskApiRequest
from summary.core.security import verify_tenant_api_key_v2
from summary.core.shared_models import (
    SummarizeWebhookFailurePayload,
    SummarizeWebhookPendingPayload,
    SummarizeWebhookSuccessPayload,
    TranscribeWebhookFailurePayload,
    TranscribeWebhookPendingPayload,
    TranscribeWebhookSuccessPayload,
)

logger = logging.getLogger(__name__)
router_tasks_v2 = APIRouter()

analytics = get_analytics()
settings = get_settings()


@router_tasks_v2.post("/async-jobs/transcribe")
async def create_transcribe_task_v2(
    request: TranscribeTaskApiRequest,
    request_tenant: AuthorizedTenant = Depends(verify_tenant_api_key_v2),
):
    """Create a transcription task."""
    if (
        request.push_to_docs_config is not None
        and not request_tenant.allowed_push_to_docs
    ):
        logger.warning(
            "Push to docs is not allowed for this tenant (%s).", request_tenant.id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Push to docs is not allowed for this tenant.",
        )

    task = process_audio_transcribe_v2_task.apply_async(
        args=[
            {
                **request.model_dump(),
                "tenant_id": request_tenant.id,
                "received_at": datetime.now(timezone.utc),
            }
        ]
    )

    # We track the request, this also properly initializes the user in the
    # analytics system, so that later feature flags work properly
    analytics.capture(
        settings.posthog_event_request,
        request.user_sub,
        properties={
            "kind": "transcribe",
            "$set": {
                "email": request.user_email,
            },
        },
    )

    return TranscribeWebhookPendingPayload(job_id=task.id).model_dump()


@router_tasks_v2.post("/async-jobs/summarize")
async def create_summarize_task_v2(
    request: SummarizeTaskApiRequest,
    request_tenant: AuthorizedTenant = Depends(verify_tenant_api_key_v2),
):
    """Create a summarization task."""
    task = summarize_v2_task.apply_async(
        args=[
            {
                **request.model_dump(),
                "tenant_id": request_tenant.id,
                "received_at": datetime.now(timezone.utc),
            }
        ]
    )

    # We track the request, this also properly initializes the user in the
    # analytics system, so that later feature flags work properly
    analytics.capture(
        settings.posthog_event_request,
        request.user_sub,
        properties={
            "kind": "summarize",
            "$set": {
                "email": request.user_email,
            },
        },
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
