"""Basic types for the summary service."""

from typing import Annotated

from pydantic import BeforeValidator, HttpUrl, TypeAdapter

http_url_adapter = TypeAdapter(HttpUrl)
Url = Annotated[
    str, BeforeValidator(lambda value: str(http_url_adapter.validate_python(value)))
]
