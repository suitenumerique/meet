"""Wrapper around Langfuse observability."""

from __future__ import annotations

import logging
from contextlib import nullcontext
from typing import Any, Callable, ContextManager

logger = logging.getLogger(__name__)

try:
    from langfuse import Langfuse as _Langfuse
    from langfuse import observe as _lf_observe
except Exception as e:
    logger.debug("Langfuse import failed: %s", e)
    _Langfuse = None
    _lf_observe = None


class Observability:
    """Wrapper around Langfuse observability."""

    def __init__(
        self, is_enabled, langfuse_host, langfuse_public_key, langfuse_secret_key
    ) -> None:
        """Initialize the Observability instance."""
        self._client = None
        if hasattr(langfuse_secret_key, "get_secret_value"):
            langfuse_secret_key = langfuse_secret_key.get_secret_value()

        self._enabled = bool(
            is_enabled and langfuse_host and langfuse_public_key and langfuse_secret_key
        )

        if not self._enabled or _Langfuse is None:
            self._enabled = False
            return

        try:
            self._client = _Langfuse(
                public_key=langfuse_public_key,
                secret_key=langfuse_secret_key,
                host=langfuse_host,
            )
        except Exception as e:
            logger.warning("Langfuse init failed: %s", e)
            self._enabled = False
            self._client = None

    def observe(
        self, **decorator_kwargs
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        """Decorator to observe a function with Langfuse. If disabled, returns a no-op decorator."""  # noqa: E501
        if self._enabled and self._client and _lf_observe is not None:
            return _lf_observe(**decorator_kwargs)

        def _noop(fn):
            return fn

        return _noop

    def span(self, name: str, **kwargs) -> ContextManager[Any]:
        """Context manager to create a span with Langfuse."""
        if self._enabled and self._client:
            start_span = getattr(self._client, "start_as_current_span", None)
            if callable(start_span):
                return start_span(name=name, **kwargs)
        return nullcontext()

    def generation(self, **kwargs) -> ContextManager[Any]:
        """Context manager to create a generation with Langfuse."""
        if self._enabled and self._client:
            start_gen = getattr(self._client, "start_as_current_generation", None)
            if callable(start_gen):
                return start_gen(**kwargs)
        return nullcontext()

    def update_current_trace(self, **kwargs) -> None:
        """Update the current trace with additional metadata."""
        if not (self._enabled and self._client):
            return
        try:
            self._client.update_current_trace(**kwargs)
        except Exception as e:
            logger.warning("Langfuse update_current_trace failed: %s", e)
            pass

    def flush(self) -> None:
        """Flush any buffered data to Langfuse."""
        if not (self._enabled and self._client):
            return
        try:
            self._client.flush()
        except Exception as e:
            logger.warning("Langfuse flush failed: %s", e)
            pass

    @property
    def is_enabled(self) -> bool:
        """Check if observability is enabled."""
        return bool(self._enabled and self._client)
