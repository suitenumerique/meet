"""LLM service to encapsulate LLM's calls."""

from typing import Any, Mapping, Optional

import openai
from langfuse import Langfuse

from summary.core.config import get_settings

settings = get_settings()


class LLMObservability:
    """Manage observability and tracing for LLM calls using Langfuse.

    Handles the initialization and configuration of the Langfuse client with
    per-user masking rules to enforce privacy controls based on tracing consent.
    Also provides an OpenAI client wrapper that integrates with Langfuse tracing
    when observability is enabled.
    """

    def __init__(
        self,
        logger,
        session_id: str,
        user_id: str,
        user_has_tracing_consent: bool = False,
    ):
        """Initialize the LLMObservability client."""
        self._logger = logger
        self._observability_client: Optional[Langfuse] = None
        self.session_id = session_id
        self.user_id = user_id

        if settings.langfuse_enabled:

            def masking_function(data, **kwargs):
                if (
                    user_has_tracing_consent
                    or settings.langfuse_environment != "production"
                ):
                    return data

                return "[REDACTED]"

            if not settings.langfuse_secret_key:
                raise ValueError(
                    "langfuse_secret_key is not configured. "
                    "Please set the secret key or disable Langfuse."
                )

            self._observability_client = Langfuse(
                secret_key=settings.langfuse_secret_key.get_secret_value(),
                public_key=settings.langfuse_public_key,
                host=settings.langfuse_host,
                environment=settings.langfuse_environment,
                mask=masking_function,
            )

    @property
    def is_enabled(self):
        """Check if observability is enabled."""
        return self._observability_client is not None

    def get_openai_client(self):
        """Get an OpenAI client configured for observability.

        Returns a regular OpenAI client if observability is disabled, or a
        Langfuse-wrapped OpenAI client that automatically traces all API calls
        to Langfuse for observability when enabled.
        """
        base_args = {
            "base_url": settings.llm_base_url,
            "api_key": settings.llm_api_key.get_secret_value(),
        }

        if not self.is_enabled:
            self._logger.debug("Using regular OpenAI client (observability disabled)")
            return openai.OpenAI(**base_args)

        # Langfuse's OpenAI wrapper is imported here to avoid triggering client
        # init at module load, which would log a warning if LANGFUSE_PUBLIC_KEY
        # is missing. Conditional import ensures Langfuse only initializes when enabled.
        from langfuse.openai import openai as langfuse_openai  # noqa: PLC0415

        self._logger.debug("Using LangfuseOpenAI client (observability enabled)")
        return langfuse_openai.OpenAI(**base_args)

    def flush(self):
        """Flush pending observability traces to Langfuse."""
        if self.is_enabled:
            self._observability_client.flush()


class LLMException(Exception):
    """LLM call failed."""


class LLMService:
    """Service for performing calls to the LLM configured in the settings."""

    def __init__(self, llm_observability, logger):
        """Init the LLMService once."""
        self._client = llm_observability.get_openai_client()
        self._observability = llm_observability
        self._logger = logger

    def call(
        self,
        system_prompt: str,
        user_prompt: str,
        name: str,
        response_format: Optional[Mapping[str, Any]] = None,
    ):
        """Call the LLM service.

        Takes a system prompt and a user prompt, and returns the LLM's response
        Returns None if the call fails.
        """
        try:
            params: dict[str, Any] = {
                "model": settings.llm_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            if response_format is not None:
                params["response_format"] = response_format

            if self._observability.is_enabled:
                params["name"] = name
                params["metadata"] = {
                    "user_id": self._observability.user_id,
                    "langfuse_tags": ["summary"],
                    "langfuse_session_id": self._observability.session_id,
                }

            response = self._client.chat.completions.create(**params)
            return response.choices[0].message.content

        except Exception as e:
            self._logger.exception("LLM call failed: %s", e)
            raise LLMException(f"LLM call failed: {e}") from e
