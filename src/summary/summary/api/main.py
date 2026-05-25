"""API routes."""

from fastapi import APIRouter, Depends

from summary.api.route import tasks_v2
from summary.core.security import verify_tenant_api_key

api_router_v2 = APIRouter(dependencies=[Depends(verify_tenant_api_key)])
api_router_v2.include_router(tasks_v2.router_tasks_v2, tags=["tasks"])
