"""Validation errors suitable for logging and transport."""

from typing import get_args

from pydantic import SecretStr, ValidationError
from pydantic_core import ErrorType, PydanticCustomError

_BUILTIN_ERROR_TYPES = frozenset(get_args(ErrorType))


def clean_validation_errors(errors: list[dict]) -> list[dict]:
    """Mask SecretStr values, including those nested in validation input."""

    def clean(value):
        if isinstance(value, SecretStr):
            return "[redacted]"
        if isinstance(value, Exception):
            # Do not retain validator exception objects, whose args may hold secrets.
            return str(value)
        if isinstance(value, dict):
            return {key: clean(item) for key, item in value.items()}
        if isinstance(value, list):
            return [clean(item) for item in value]
        if isinstance(value, tuple):
            return tuple(clean(item) for item in value)
        return value

    return clean(errors)


class CleanedValidationError(ValidationError):
    """A new Pydantic exception with secret inputs replaced by a marker."""

    def __init__(self, error, *args, secret_input=False, **kwargs):
        """State is initialized by Pydantic during __new__."""

    def __new__(cls, error, *args, secret_input=False, **kwargs):
        """Accept an original error, or Pydantic's native construction arguments."""
        if not isinstance(error, ValidationError):
            # Pydantic uses this path when constructing or unpickling the error.
            return super().__new__(cls, error, *args, **kwargs)

        details = clean_validation_errors(error.errors(include_url=False))
        for detail in details:
            if secret_input:
                # An adapter may have received the unwrapped value of a SecretStr.
                detail["input"] = "[redacted]"
        return cls._from_details(error.title, details)

    @classmethod
    def _from_details(cls, title, details):
        """Reconstruct builtin and custom Pydantic error codes."""
        for detail in details:
            if detail["type"] not in _BUILTIN_ERROR_TYPES:
                detail["type"] = PydanticCustomError(
                    detail["type"], detail["msg"], detail.get("ctx")
                )
        return cls.from_exception_data(title, details, hide_input=True)

    def __reduce__(self):
        """Preserve custom error codes when Celery pickles the exception."""
        return self._from_details, (self.title, self.errors(include_url=False))
