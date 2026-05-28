"""Application configuration and settings."""

import logging
import os
from functools import cached_property, lru_cache
from typing import Annotated, Any, List, Literal, Mapping, Optional, Set

from fastapi import Depends
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

from summary.core.types import Url

logger = logging.getLogger(__name__)


class AuthorizedTenant(BaseModel):
    """Authorized tenant configuration."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(title="Tenant Id", description="A unique ID for the tenant.")
    api_key: SecretStr = Field(title="API key for using the summary API", min_length=8)
    webhook_url: Url = Field(
        title="Webhook URL", description="The URL to send the summary to."
    )
    webhook_api_key: SecretStr = Field(
        title="Webhook API Key",
        description="The api_key to authenticate the webhook request.",
    )


class Settings(BaseSettings):
    """Configuration settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(env_file=".env", frozen=True)

    app_name: str = "summary"
    app_api_v2_str: str = "/api/v2"

    # Authorized Tenants
    # Using env variables to store authorized tenants for now
    # to avoid any other external dependency (DB)
    authorized_tenants: tuple[AuthorizedTenant, ...] = Field(min_length=1)

    # Audio recordings
    recording_max_duration: Optional[int] = None
    codec_to_extension: dict[str, str] = Field(
        default_factory=lambda: {
            "aac": ".m4a",
            "alac": ".m4a",
            "mp3": ".mp3",
            "opus": ".opus",
            "vorbis": ".ogg",
            "flac": ".flac",
        }
    )

    # Celery settings
    celery_broker_url: str = "redis://redis/0"
    celery_result_backend: str = "redis://redis/0"
    celery_max_retries: int = 1

    # v2 tasks
    transcribe_queue_v2: str = "transcribe-queue-v2"
    summarize_queue_v2: str = "summarize-queue-v2"
    call_webhook_queue_v2: str = "call-webhook-queue-v2"

    # Minio settings
    aws_storage_bucket_name: str
    aws_s3_endpoint_url: str
    aws_s3_access_key_id: str
    aws_s3_secret_access_key: SecretStr
    aws_s3_secure_access: bool = True
    aws_transcript_path: str = "transcripts"
    aws_summary_path: str = "summaries"

    # AI-related settings
    whisperx_api_key: SecretStr
    whisperx_base_url: str = "https://api.openai.com/v1"
    whisperx_asr_model: str = "whisper-1"
    # ISO 639-1 language code (e.g., "en", "fr", "es")
    whisperx_default_language: Optional[str] = None
    whisperx_allowed_languages: Set[str] = {"en", "fr", "de", "nl"}
    llm_base_url: str
    llm_api_key: SecretStr
    llm_model: str

    # Transcription processing
    hallucination_patterns: List[str] = ["Vap'n'Roll Thierry"]

    # Speaker to user assignment
    is_resolve_speaker_identities_enabled: bool = True
    resolve_speaker_identities_default_overlap_threshold: float = 0.5
    resolve_speaker_identities_enable_split_on_words: bool = True
    resolve_speaker_identities_max_word_duration: float = 1  # seconds

    # Webhook-related settings
    webhook_max_retries: int = 2
    webhook_status_forcelist: List[int] = [502, 503, 504]
    webhook_backoff_factor: float = 0.1

    # Summary related settings
    is_summary_enabled: bool = True
    transcription_satisfaction_form_base_url: Optional[str] = None

    # Sentry
    sentry_is_enabled: bool = False
    sentry_dsn: Optional[str] = None

    # Posthog (analytics)
    posthog_enabled: bool = False
    posthog_api_key: Optional[str] = None
    posthog_api_host: Optional[str] = "https://eu.i.posthog.com"
    posthog_event_failure: str = "transcript-failure"
    posthog_event_success: str = "transcript-success"

    # Langfuse (LLM Observability)
    langfuse_enabled: bool = False
    langfuse_host: Optional[str] = None
    langfuse_public_key: Optional[str] = None
    langfuse_secret_key: Optional[SecretStr] = None
    langfuse_environment: Optional[str] = "development"

    # TaskTracker
    task_tracker_redis_url: str = "redis://redis/0"
    task_tracker_prefix: str = "task_metadata:"

    @model_validator(mode="after")
    def validate_authorized_tenants(self):
        """Validate authorized tenants configuration."""
        tenant_ids = {tenant.id for tenant in self.authorized_tenants}

        if len(tenant_ids) != len(self.authorized_tenants):
            raise ValueError("Duplicate tenant ids are not allowed")

        api_keys = {
            tenant.api_key.get_secret_value() for tenant in self.authorized_tenants
        }

        if len(api_keys) != len(self.authorized_tenants):
            raise ValueError("Duplicate application API api_keys are not allowed")
        return self


    @cached_property
    def authorized_tenant_api_keys(self) -> frozenset[str]:
        """Return a frozenset of authorized tenant API api_keys."""
        return frozenset(
            app.api_key.get_secret_value() for app in self.authorized_tenants
        )

    @cached_property
    def authorized_tenant_by_id(self) -> Mapping[str, AuthorizedTenant]:
        """Return a dict of authorized tenants by ID."""
        return {app.id: app for app in self.authorized_tenants}

    @cached_property
    def authorized_tenant_by_api_key(self) -> Mapping[str, AuthorizedTenant]:
        """Return the authorized tenant for a given API api_key."""
        return {app.api_key.get_secret_value(): app for app in self.authorized_tenants}

    def get_authorized_tenant(
        self, *, tenant_id: str | None = None, api_key: str | None = None
    ) -> AuthorizedTenant:
        """Return the authorized tenant for a given API api_key or id."""
        if tenant_id is None and api_key is None:
            raise ValueError("Either tenant_id or api_key must be provided")
        if tenant_id is not None and api_key is not None:
            raise ValueError("Only one of tenant_id or api_key can be provided")

        if tenant_id is not None:
            return self.authorized_tenant_by_id[tenant_id]
        else:
            return self.authorized_tenant_by_api_key[api_key]


@lru_cache
def get_settings():
    """Load and cache application settings."""
    return Settings()


SettingsDeps = Annotated[Settings, Depends(get_settings)]
