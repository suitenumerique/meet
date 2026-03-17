"""Models for the API & Celery tasks creation."""

from pydantic import BaseModel, Field, field_validator

from summary.core.config import get_settings
from summary.core.types import Url

settings = get_settings()


class SharedV2TaskCreation(BaseModel):
    """Model that holds basic information for task creation."""

    user_sub: str = Field(title="User Sub", description="The user's sub.")


class TranscribeTaskV2Request(SharedV2TaskCreation):
    """Model for creating a transcribe and summarize task (used for API request)."""

    cloud_storage_url: Url = Field(
        title="Cloud storage URL",
        description="The URL of the audio file to transcribe.",
    )
    context_language: str | None = Field(
        default=None,
        title="Context Language",
        description="The language of the context text.",
    )
    language: str = Field(
        title="Language", description="The language of the content to summarize."
    )

    @field_validator("language")
    @classmethod
    def validate_language(cls, v):
        """Validate 'language' parameter."""
        if v is not None and v not in settings.whisperx_allowed_languages:
            raise ValueError(
                f"Language '{v}' is not allowed. "
                f"Allowed languages: {', '.join(settings.whisperx_allowed_languages)}"
            )
        return v


class TranscribeTaskV2Payload(TranscribeTaskV2Request):
    """Model for creating a transcribe and summarize task (used for actual task creation)."""  # noqa: E501

    tenant_id: str = Field(title="Tenant ID", description="The ID of the tenant.")


class SummarizeTaskV2Request(SharedV2TaskCreation):
    """Model for creating a summarize task (used for API request)."""

    content: str = Field(title="Content", description="The content to summarize.")


class SummarizeTaskV2Payload(SummarizeTaskV2Request):
    """Model for creating a summarize task (used for actual task creation)."""

    tenant_id: str = Field(title="Tenant ID", description="The ID of the tenant.")
