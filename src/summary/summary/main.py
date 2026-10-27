"""Application."""

from dockerflow.fastapi import router as dockerflow_router
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from summary.api.main import api_router_v2
from summary.core import checks  # noqa: F401 -- registers the Dockerflow checks
from summary.core.config import get_settings
from summary.core.exceptions import clean_validation_errors
from summary.core.sentry import init_sentry

settings = get_settings()


init_sentry()

app = FastAPI(
    title=settings.app_name,
)

app.include_router(api_router_v2, prefix=settings.app_api_v2_str)
app.include_router(dockerflow_router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """Keep validation details while masking SecretStr input values."""
    del request
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder({"detail": clean_validation_errors(exc.errors())}),
    )
