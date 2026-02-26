# ruff: noqa: PLC0415

from django.conf import settings


def task(*d_args, **d_kwargs):
    """
    Decorator compatible with Celery's @app.task, but works without Celery.

    If Celery is available, returns a real Celery task.
    If not, returns the original function and provides `.delay()`/`.apply_async()`
    as synchronous fallbacks (so existing call sites don't break).

    Notes:
        Mostly LLM-generated.
    """

    def _fallback_wrap(func):
        def delay(*args, **kwargs):
            return func(*args, **kwargs)

        def apply_async(args=None, kwargs=None, **_options):
            return func(*(args or ()), **(kwargs or {}))

        func.delay = delay
        func.apply_async = apply_async
        return func

    # Handle bare decorator usage: @task
    if len(d_args) == 1 and callable(d_args[0]) and not d_kwargs:
        func = d_args[0]
        if settings.CELERY_ENABLED:
            from meet.celery_app import app as _celery_app

            return _celery_app.task(func)
        return _fallback_wrap(func)

    # Handle parameterized usage: @task(...), e.g. @task(bind=True)
    def _decorate(func):
        if settings.CELERY_ENABLED:
            from meet.celery_app import app as _celery_app

            return _celery_app.task(*d_args, **d_kwargs)(func)
        return _fallback_wrap(func)

    return _decorate


__all__ = ("task",)
