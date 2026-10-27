"""Secret URLs stay masked until explicitly serialized for transport."""

from unittest.mock import Mock

import pytest
from kombu.serialization import dumps, loads
from pydantic import SecretStr, ValidationError

from summary.core import celery_worker
from summary.core.models import (
    PushToDocsTranscriptConfig,
    RecordingMetadata,
    TranscribeTaskApiRequest,
    TranscribeTaskJob,
)
from summary.core.privacy import dump_for_transport
from summary.core.shared_models import (
    SummarizeWebhookSuccessPayload,
    TranscribeWebhookSuccessPayload,
    WhisperXResponse,
)

CANARY = "private-signed-url-canary"
SIGNED_URL = f"https://storage.example.com/recording.mp4?signature={CANARY}"
METADATA = {
    "cloud_storage_url": SIGNED_URL,
    "started_at": "2026-01-01T10:00:00Z",
    "ended_at": "2026-01-01T11:00:00Z",
}
DOCS_CONFIG = {
    "user_email": "user@example.com",
    "title": "Meeting",
    "download_link": SIGNED_URL,
    "form_link": SIGNED_URL,
}
MODEL_CASES = [
    (RecordingMetadata, METADATA, "cloud_storage_url"),
    (
        TranscribeTaskApiRequest,
        {"user_sub": "user", "language": "en", "cloud_storage_url": SIGNED_URL},
        "cloud_storage_url",
    ),
    (PushToDocsTranscriptConfig, DOCS_CONFIG, "download_link"),
    (PushToDocsTranscriptConfig, DOCS_CONFIG, "form_link"),
    (
        TranscribeWebhookSuccessPayload,
        {"job_id": "job", "transcription_data_url": SIGNED_URL},
        "transcription_data_url",
    ),
    (
        SummarizeWebhookSuccessPayload,
        {"job_id": "job", "summary_data_url": SIGNED_URL},
        "summary_data_url",
    ),
]


@pytest.mark.parametrize(("model", "data", "field"), MODEL_CASES)
def test_signed_urls_are_masked_by_default(model, data, field):
    """Reprs, ordinary dumps and JSON output mask all signed URL fields."""
    value = model.model_validate(data)
    secret = getattr(value, field)
    assert isinstance(secret, SecretStr)
    assert secret.get_secret_value() == SIGNED_URL
    assert CANARY not in repr(value)
    assert CANARY not in str(value.model_dump())
    assert CANARY not in value.model_dump_json()
    assert dump_for_transport(value)[field] == SIGNED_URL
    assert getattr(model.model_validate(value.model_dump()), field) == secret


@pytest.mark.parametrize(("model", "data", "field"), MODEL_CASES)
def test_missing_fields_do_not_echo_signed_urls(model, data, field):
    """Root validation errors omit raw input even before secrets are wrapped."""
    required_field = (
        "job_id"
        if "job_id" in data
        else next(
            key for key in data if key not in {field, "download_link", "form_link"}
        )
    )
    invalid_data = {key: value for key, value in data.items() if key != required_field}
    with pytest.raises(ValidationError) as exc:
        model.model_validate(invalid_data)
    assert CANARY not in str(exc.value)


@pytest.mark.parametrize(("model", "data", "field"), MODEL_CASES[:4])
def test_invalid_signed_urls_have_sanitized_validation_messages(model, data, field):
    """URL validation still rejects invalid URLs without quoting their value."""
    with pytest.raises(ValidationError) as exc:
        model.model_validate({**data, field: f"not-a-url?signature={CANARY}"})
    assert CANARY not in str(exc.value)
    assert CANARY not in str(
        exc.value.errors(include_input=False, include_context=False)
    )
    assert exc.value.errors()[0]["type"] == "url_parsing"
    assert exc.value.errors()[0]["input"] == "[redacted]"


def test_nested_task_urls_survive_broker_serialization():
    """Nested secrets round-trip through Celery's JSON serializer as real URLs."""
    payload = TranscribeTaskJob(
        user_sub="user",
        language="en",
        cloud_storage_url=SIGNED_URL,
        tenant_id="tenant",
        received_at="2026-01-01T10:00:00Z",
        metadata=METADATA,
        push_to_docs_config=DOCS_CONFIG,
    )
    assert CANARY not in repr(payload)
    assert CANARY not in payload.model_dump_json()
    content_type, encoding, body = dumps(dump_for_transport(payload), serializer="json")
    restored = TranscribeTaskJob.model_validate(loads(body, content_type, encoding))
    assert restored.cloud_storage_url.get_secret_value() == SIGNED_URL
    assert restored.metadata.cloud_storage_url.get_secret_value() == SIGNED_URL
    assert restored.push_to_docs_config.download_link.get_secret_value() == SIGNED_URL
    assert restored.push_to_docs_config.form_link.get_secret_value() == SIGNED_URL


def test_transcription_worker_uses_real_urls(monkeypatch):
    """The worker unwraps input URLs and publishes usable signed result URLs."""
    transcription = WhisperXResponse(segments=())
    transcribe = Mock(return_value=transcription)
    monkeypatch.setattr(celery_worker, "transcribe_audio", transcribe)
    monkeypatch.setattr(celery_worker, "_should_push_to_docs", Mock(return_value=True))
    monkeypatch.setattr(
        celery_worker, "_should_auto_create_summary", Mock(return_value=False)
    )
    formatter = Mock(return_value="Formatted transcript")
    monkeypatch.setattr(celery_worker, "format_transcript", formatter)
    monkeypatch.setattr(celery_worker, "create_document_in_lasuite_docs", Mock())
    storage = Mock()
    storage.get_transcript_signed_url.return_value = SIGNED_URL
    monkeypatch.setattr(celery_worker, "file_service", storage)
    monkeypatch.setattr(celery_worker, "metadata_manager", Mock())
    publish = Mock()
    monkeypatch.setattr(celery_worker.call_webhook_v2_task, "apply_async", publish)
    task = celery_worker.process_audio_transcribe_v2_task
    monkeypatch.setattr(task.request, "id", "job")

    result = task.run(
        {
            "user_sub": "user",
            "language": "en",
            "cloud_storage_url": SIGNED_URL,
            "tenant_id": "tenant",
            "received_at": "2026-01-01T10:00:00Z",
            "push_to_docs_config": DOCS_CONFIG,
        }
    )
    assert transcribe.call_args.kwargs["cloud_storage_url"] == SIGNED_URL
    assert formatter.call_args.args[3:] == (SIGNED_URL, SIGNED_URL)
    assert result["transcription_data_url"] == SIGNED_URL
    assert publish.call_args.kwargs["args"][0] == result


def test_recording_metadata_url_is_unwrapped(monkeypatch):
    """Speaker assignment fetches metadata using the real URL."""
    storage = Mock()
    monkeypatch.setattr(celery_worker, "file_service", storage)
    resolver = Mock()
    resolver.return_value.apply_to.return_value = {"segments": []}
    monkeypatch.setattr(celery_worker, "resolve_speaker_identities", resolver)
    celery_worker.resolve_speaker_identities_and_apply_to(
        transcription=WhisperXResponse(segments=()),
        recording_metadata=RecordingMetadata.model_validate(METADATA),
        task_id="job",
    )
    storage.read_cloud_storage_json.assert_called_once_with(SIGNED_URL)
