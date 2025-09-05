from summary.core.analytics import MetadataManager, get_analytics
from celery import signals
from summary.core.config import get_settings

analytics = get_analytics()
settings = get_settings()
metadata_manager = MetadataManager()


@signals.task_prerun.connect
def task_started(task_id=None, task=None, args=None, **kwargs):
    """Signal handler called before task execution begins."""
    task_args = args or []
    metadata_manager.create(task_id, task_args)


@signals.task_retry.connect
def task_retry_handler(request=None, reason=None, einfo=None, **kwargs):
    """Signal handler called when task execution retries."""
    metadata_manager.retry(request.id)


@signals.task_failure.connect
def task_failure_handler(task_id, exception=None, **kwargs):
    """Signal handler called when task execution fails permanently."""
    metadata_manager.capture(task_id, settings.posthog_event_failure)
