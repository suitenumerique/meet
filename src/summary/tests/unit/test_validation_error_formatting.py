"""Formatted validation errors hide input values, including after pickling."""

import pickle
import traceback

from pydantic import ValidationError

from summary.core.exceptions import CleanedValidationError

CANARY = "private-validation-canary"


def test_formatted_errors_hide_ordinary_input_after_pickle_roundtrip():
    """Formatting hides raw input even when diagnostics intentionally retain it."""
    original = ValidationError.from_exception_data(
        "TestModel",
        [{"type": "int_parsing", "loc": ("field",), "input": CANARY}],
    )
    cleaned = CleanedValidationError(original)
    restored = pickle.loads(pickle.dumps(cleaned))  # noqa: S301 -- own test exception
    for error in (cleaned, restored):
        assert error.errors()[0]["input"] == CANARY
        assert CANARY not in str(error)
        assert CANARY not in repr(error)
        assert CANARY not in "".join(traceback.format_exception(error))
        assert error.errors()[0]["type"] == "int_parsing"
