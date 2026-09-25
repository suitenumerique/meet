"""Application."""

import sentry_sdk
from dockerflow.fastapi import router as dockerflow_router
from fastapi import FastAPI

from summary.api.main import api_router_v2
from summary.core import checks  # noqa: F401 -- registers the Dockerflow checks
from summary.core.config import get_settings

settings = get_settings()


if settings.sentry_dsn and settings.sentry_is_enabled:
    sentry_sdk.init(dsn=settings.sentry_dsn, enable_tracing=True)

app = FastAPI(
    title=settings.app_name,
)

app.include_router(api_router_v2, prefix=settings.app_api_v2_str)
app.include_router(dockerflow_router)
