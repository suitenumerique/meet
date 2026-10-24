"""Application."""

from dockerflow.fastapi import router as dockerflow_router
from fastapi import FastAPI

from summary.api.main import api_router_v2
from summary.core import checks  # noqa: F401 -- registers the Dockerflow checks
from summary.core.config import get_settings
from summary.core.sentry import init_sentry

settings = get_settings()


init_sentry()

app = FastAPI(
    title=settings.app_name,
)

app.include_router(api_router_v2, prefix=settings.app_api_v2_str)
app.include_router(dockerflow_router)
