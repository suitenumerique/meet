"""LLM service to encapsulate LLM's calls."""

import logging
from typing import Any, Mapping, Optional

import openai

from summary.core.config import get_settings

settings = get_settings()

logger = logging.getLogger(__name__)


class LLMException(Exception):
    """LLM call failed."""


class LLMService:
    """Service for performing calls to the LLM configured in the settings."""

    def __init__(self):
        """Init the LLMService once."""
        self._client = openai.OpenAI(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key.get_secret_value(),
        )

    def call(
        self,
        system_prompt: str,
        user_prompt: str,
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

            response = self._client.chat.completions.create(**params)

            return response.choices[0].message.content

        except Exception as e:
            logger.exception("LLM call failed: %s", e)
            raise LLMException("LLM call failed: {e}") from e
