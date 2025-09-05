from celery import Celery
from celery import signals
import sentry_sdk
from summary.core.config import get_settings
import summary.core.celery_signals

settings = get_settings()

celery = Celery(
    __name__,
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    broker_connection_retry_on_startup=True,
)

celery.config_from_object("summary.core.celery_config")

if settings.sentry_dsn and settings.sentry_is_enabled:

    @signals.celeryd_init.connect
    def init_sentry(**_kwargs):
        """Initialize sentry."""
        sentry_sdk.init(dsn=settings.sentry_dsn, enable_tracing=True)
