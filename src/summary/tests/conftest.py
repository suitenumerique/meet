"""Shared test fixtures and environment setup for the summary service tests."""

import os

# Set required environment variables BEFORE any summary module imports.
# This is necessary because several modules call get_settings() at module level,
# which validates env vars via Pydantic Settings.
os.environ.setdefault("APP_API_TOKEN", "test-api-token")
os.environ.setdefault("AWS_STORAGE_BUCKET_NAME", "test-bucket")
os.environ.setdefault("AWS_S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("AWS_S3_ACCESS_KEY_ID", "test-access-key")
os.environ.setdefault("AWS_S3_SECRET_ACCESS_KEY", "test-secret-key")
os.environ.setdefault("AWS_S3_SECURE_ACCESS", "false")
os.environ.setdefault("WHISPERX_API_KEY", "test-whisperx-key")
os.environ.setdefault("WHISPERX_BASE_URL", "http://localhost:8000/v1")
os.environ.setdefault("LLM_BASE_URL", "http://localhost:8001/v1")
os.environ.setdefault("LLM_API_KEY", "test-llm-key")
os.environ.setdefault("LLM_MODEL", "test-model")
os.environ.setdefault("WEBHOOK_API_TOKEN", "test-webhook-token")
os.environ.setdefault("WEBHOOK_URL", "http://localhost:8002/webhook")
os.environ.setdefault("CELERY_BROKER_URL", "memory://")
os.environ.setdefault("CELERY_RESULT_BACKEND", "cache+memory://")
os.environ.setdefault("POSTHOG_ENABLED", "false")
os.environ.setdefault("SENTRY_IS_ENABLED", "false")
os.environ.setdefault("LANGFUSE_ENABLED", "false")
os.environ.setdefault("TASK_TRACKER_REDIS_URL", "redis://localhost:6379/0")
