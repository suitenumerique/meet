"""Validation cleanup preserves diagnostics without retaining SecretStr values."""

import json
import pickle

import pytest
from celery.utils.serialization import get_pickleable_exception
from pydantic import SecretStr, ValidationError
from pydantic_core import PydanticCustomError

from summary.core.exceptions import CleanedValidationError, clean_validation_errors

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
