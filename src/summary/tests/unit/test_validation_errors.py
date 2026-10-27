"""Validation cleanup preserves diagnostics without retaining SecretStr values."""

import asyncio
import json
import pickle
import traceback
from unittest.mock import MagicMock, Mock

import pytest
from celery.exceptions import Retry
from celery.utils.serialization import get_pickleable_exception
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from pydantic import SecretStr, ValidationError
from pydantic_core import PydanticCustomError

from summary.core import celery_worker
from summary.core.exceptions import CleanedValidationError, clean_validation_errors
from summary.main import validation_error_handler

CANARY = "private-validation-canary"


@pytest.mark.parametrize("custom", [False, True])
def test_cleaned_validation_error_preserves_details_and_pickles(custom):
    """Builtin and custom validation errors retain their type, location and message."""
    error_type = (
        PydanticCustomError(
            "custom_validation", "Invalid value: {reason}", {"reason": "test"}
        )
        if custom
        else "int_type"
    )
    original = ValidationError.from_exception_data(
        "TestModel",
        [
            {"type": error_type, "loc": ("secret",), "input": SecretStr(CANARY)},
            {"type": "int_parsing", "loc": ("ordinary",), "input": "not-an-int"},
        ],
    )
    cleaned = CleanedValidationError(original)
    original_details = original.errors()
    details = cleaned.errors()
    assert isinstance(cleaned, ValidationError)
    assert cleaned.title == original.title
    assert cleaned.error_count() == original.error_count()
    assert details[0] == {**original_details[0], "input": "[redacted]"}
    assert details[1] == original_details[1]
    assert isinstance(original.errors()[0]["input"], SecretStr)
    assert CANARY not in str(cleaned)
    assert CANARY not in cleaned.json()
    serialized = pickle.dumps(cleaned)
    assert CANARY.encode() not in serialized
    restored = pickle.loads(serialized)  # noqa: S301 -- own in-memory test exception
    assert isinstance(restored, CleanedValidationError)
    assert restored.errors() == details
    assert isinstance(get_pickleable_exception(cleaned), CleanedValidationError)


def test_cleanup_masks_nested_secrets_and_preserves_plain_input():
    """Missing-field inputs keep ordinary values while masking nested secrets."""
    original = ValidationError.from_exception_data(
        "NestedModel",
        [
            {
                "type": "missing",
                "loc": ("required",),
                "input": {
                    "ordinary": "keep me",
                    "nested": [SecretStr(CANARY), {"url": SecretStr(CANARY)}],
                    "tuple": (SecretStr(CANARY), 42),
                },
            }
        ],
    )
    cleaned = CleanedValidationError(original)
    assert cleaned.errors()[0]["input"] == {
        "ordinary": "keep me",
        "nested": ["[redacted]", {"url": "[redacted]"}],
        "tuple": ("[redacted]", 42),
    }
    assert CANARY not in cleaned.json()
    assert CANARY.encode() not in pickle.dumps(cleaned)


def test_cleanup_does_not_retain_validator_exception_objects():
    """Validator context keeps its readable message without secret-bearing args."""
    original = ValidationError.from_exception_data(
        "TestModel",
        [
            {
                "type": "value_error",
                "loc": (),
                "input": SecretStr(CANARY),
                "ctx": {"error": ValueError(SecretStr(CANARY))},
            }
        ],
    )
    cleaned = CleanedValidationError(original)
    assert cleaned.errors()[0]["ctx"] == {"error": "**********"}
    assert CANARY.encode() not in pickle.dumps(cleaned)


def test_clean_validation_errors_keeps_all_other_fields():
    """The API cleanup preserves diagnostics and nonsecret input."""
    details = [
        {
            "type": "test",
            "loc": ("body", "field"),
            "msg": "Invalid value",
            "url": "https://example.com/errors/test",
            "ctx": {"limit": 3},
            "input": "ordinary input",
        }
    ]
    assert clean_validation_errors(details) == details
    assert (
        json.loads(json.dumps(clean_validation_errors(details)))[0]["input"]
        == "ordinary input"
    )


@pytest.mark.parametrize(
    "handler_name",
    [
        "call_webhook_v2_task",
        "process_audio_transcribe_v2_task",
        "summarize_v2_task",
        "task_started_transcript",
        "task_started_summary",
    ],
)
@pytest.mark.parametrize("secret_wrapped", [False, True])
def test_task_validation_uses_cleaned_errors(handler_name, secret_wrapped):
    """Task entry points and prerun signals consistently suppress the original error."""
    handler = getattr(celery_worker, handler_name)
    signed_url = f"https://storage.example.com/file?signature={CANARY}"
    value = SecretStr(signed_url) if secret_wrapped else signed_url
    payload = {"cloud_storage_url": value, "content": value}
    with pytest.raises(CleanedValidationError) as exc:
        if handler_name.startswith("task_started"):
            handler(task_id="job", args=[payload])
        elif handler_name == "call_webhook_v2_task":
            handler.run(
                payload={
                    "type": "summary",
                    "status": "success",
                    "summary_data_url": value,
                },
                tenant_id="tenant",
            )
        elif handler_name == "summarize_v2_task":
            # Exercise validation without triggering the summary task's retries.
            handler._orig_run(payload=payload)
        else:
            handler.run(payload=payload)
    assert exc.value.__suppress_context__
    assert CANARY not in "".join(traceback.format_exception(exc.value))
    assert CANARY not in exc.value.json()
    assert CANARY.encode() not in pickle.dumps(exc.value)


def test_upstream_transcription_validation_hides_raw_input(monkeypatch):
    """Invalid ASR responses do not remain in structured validation errors."""
    storage = MagicMock()
    storage.prepare_audio_file.return_value.__enter__.return_value = (
        Mock(),
        {"duration": 1},
    )
    monkeypatch.setattr(celery_worker, "file_service", storage)
    monkeypatch.setattr(celery_worker, "metadata_manager", Mock())
    response = Mock(status_code=200)
    response.json.return_value = {"text": {"content": CANARY}}
    monkeypatch.setattr(celery_worker.requests, "post", Mock(return_value=response))
    with pytest.raises(CleanedValidationError) as exc:
        celery_worker.transcribe_audio(
            task_id="job", language="en", cloud_storage_url="https://example.com/audio"
        )
    assert exc.value.errors()[0]["input"] == "[redacted]"
    assert CANARY not in exc.value.json()
    assert CANARY.encode() not in pickle.dumps(exc.value)


def test_api_error_handler_uses_secret_aware_cleanup():
    """API errors mask typed secrets while retaining other values and context."""
    errors = [
        {
            "type": "test",
            "loc": ("body", "field"),
            "msg": "Invalid value",
            "input": {"url": SecretStr(CANARY), "ordinary": "keep me"},
            "ctx": {"limit": 3},
            "url": "https://example.com/errors/test",
        },
    ]
    response = asyncio.run(
        validation_error_handler(
            Request({"type": "http"}), RequestValidationError(errors)
        )
    )
    assert response.status_code == 422
    assert CANARY.encode() not in response.body
    assert json.loads(response.body)["detail"] == [
        {
            "type": "test",
            "loc": ["body", "field"],
            "msg": "Invalid value",
            "input": {"url": "[redacted]", "ordinary": "keep me"},
            "ctx": {"limit": 3},
            "url": "https://example.com/errors/test",
        },
    ]


def test_summary_task_retries_with_the_cleaned_exception(monkeypatch):
    """The summary task still retries validation failures using the safe exception."""
    retry = Mock(side_effect=Retry())
    monkeypatch.setattr(celery_worker.summarize_v2_task, "retry", retry)
    with pytest.raises(Retry):
        celery_worker.summarize_v2_task.run(payload={"received_at": SecretStr(CANARY)})
    error = retry.call_args.kwargs["exc"]
    assert isinstance(error, CleanedValidationError)
    assert CANARY.encode() not in pickle.dumps(error)
