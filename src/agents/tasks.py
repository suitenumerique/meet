"""Helpers for managing asyncio tasks."""

import asyncio
import logging
from collections.abc import Callable
from typing import Any


def done_callback(
    logger: logging.Logger,
    tasks: set[asyncio.Task],
    description: str,
    *,
    on_success: Callable[[Any], None] | None = None,
) -> Callable[[asyncio.Task], None]:
    """Build a done-callback for a background task.

    Meant to be passed to `asyncio.Task.add_done_callback`.

    Args:
        logger: Logger used to report failures, so records keep the caller's
            logger name.
        tasks: Set the task was registered in; the task is discarded from it.
        description: Human-readable intended action
        on_success: Optional callback invoked with the task's result when it
            completes without error.

    Returns:
        A callback suitable for ``task.add_done_callback(...)``.
    """

    def _finalize(task: asyncio.Task) -> None:
        tasks.discard(task)
        if task.cancelled():
            return
        if (exc := task.exception()) is not None:
            logger.exception("failed to %s", description, exc_info=exc)
            return
        if on_success is not None:
            on_success(task.result())

    return _finalize
