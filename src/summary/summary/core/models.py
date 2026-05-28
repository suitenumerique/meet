"""Models for the API & Celery tasks creation."""

from datetime import datetime

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from summary.core.config import get_settings
from summary.core.types import Url

settings = get_settings()


class SharedV2TaskCreation(BaseModel):
    """Model that holds basic information for task creation."""

    user_sub: str = Field(title="User Sub", description="The user's sub.")
    user_email: str | None = Field(
        default=None,
        title="User Email",
        description="The user's email for analytics purposes.",
    )


class RecordingMetadata(BaseModel):
    """Model for recording metadata."""

    cloud_storage_url: Url = Field(
        title="Cloud Storage URL",
        description="The URL of the metadata file for speaker assignement.",
    )
    started_at: AwareDatetime = Field(title="Start time of the recording to transcribe")
    ended_at: AwareDatetime = Field(title="End time of the recording to transcribe")


class PushToDocsBaseConfig(BaseModel):
    """Model containing information for pushing transcript and summaries to docs."""

    user_email: str = Field(
        title="User Email", description="The user's email, future owner of the docs."
    )
    title: str = Field(title="Title", description="The title for the created document.")


class PushToDocsTranscriptConfig(PushToDocsBaseConfig):
    """Model for push to docs information for transcripts."""

    download_link: str | None = Field(
        default=None,
        title="Download Link",
        description="The link to download the recording.",
    )
    form_link: str | None = Field(
        default=None,
        title="Form Link",
        description="The link to fill out a form for the recording.",
    )
    auto_create_summary: bool = Field(
        title="Auto Create Summary Docs",
        description="Whether to automatically create a summary "
        "for the transcription task and push it to docs.",
        default=False,
    )


class PushToDocsSummaryConfig(PushToDocsBaseConfig):
    """Model for push to docs information for summaries."""


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
        title="Language", description="The language of the content to transcribe."
    )
    metadata: RecordingMetadata | None = Field(
        title="Metadata",
        description="The metadata for the transcribe task.",
        default=None,
    )
    push_to_docs_config: PushToDocsTranscriptConfig | None = Field(
        title="Push to Docs info",
        description="If set, configuration for pushing to docs",
        default=None,
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
    received_at: datetime = Field(
        title="Received At", description="The time the task was received."
    )


class SummarizeTaskV2Request(SharedV2TaskCreation):
    """Model for creating a summarize task (used for API request)."""

    content: str = Field(title="Content", description="The content to summarize.")


class SummarizeTaskV2Payload(SummarizeTaskV2Request):
    """Model for creating a summarize task (used for actual task creation)."""

    tenant_id: str = Field(title="Tenant ID", description="The ID of the tenant.")
    received_at: datetime = Field(
        title="Received At", description="The time the task was received."
    )
