"""Basic types for the summary service."""

from typing import Annotated

from pydantic import (
    AfterValidator,
    BeforeValidator,
    HttpUrl,
    SecretStr,
    TypeAdapter,
    ValidationError,
)

from summary.core.exceptions import CleanedValidationError

http_url_adapter = TypeAdapter(HttpUrl)
Url = Annotated[
    str, BeforeValidator(lambda value: str(http_url_adapter.validate_python(value)))
]


def _validate_secret_url(value: SecretStr) -> SecretStr:
    """Validate and normalize a URL without echoing it in validator messages."""
    try:
        return SecretStr(
            str(http_url_adapter.validate_python(value.get_secret_value()))
        )
    except ValidationError as exc:
        raise CleanedValidationError(exc, secret_input=True) from None


SecretUrl = Annotated[SecretStr, AfterValidator(_validate_secret_url)]
