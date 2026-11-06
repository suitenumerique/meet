"""Specification of the LiveKit clusters settings (LIVEKIT_CLUSTERS)."""

import re
from typing import Annotated

from pydantic import (
    AfterValidator,
    AnyUrl,
    BaseModel,
    Field,
    NonNegativeInt,
    SecretStr,
    StringConstraints,
    TypeAdapter,
    UrlConstraints,
    ValidationError,
)
from pydantic_core import PydanticCustomError

LIVEKIT_CLUSTER_NAME_MAX_LENGTH = 63
LIVEKIT_CLUSTER_NAME_PATTERN = rf"^[a-z0-9-]{{1,{LIVEKIT_CLUSTER_NAME_MAX_LENGTH}}}$"

_LIVEKIT_URL_ADAPTER = TypeAdapter(
    Annotated[AnyUrl, UrlConstraints(allowed_schemes=["http", "https", "ws", "wss"])]
)


_LIVEKIT_URL_AUTHORITY = re.compile(r"(?i)(https?|wss?)://[^/\\]")


def _check_livekit_url(url: str) -> str:
    """Ensure a URL reaches LiveKit over HTTP/WebSocket, and stay unchanged."""
    if " " in url or not url.isprintable():
        raise PydanticCustomError(
            "url_characters",
            "URL should not contain whitespace or non-printable characters",
        )
    _LIVEKIT_URL_ADAPTER.validate_python(url)
    if not _LIVEKIT_URL_AUTHORITY.match(url):
        raise PydanticCustomError(
            "url_authority", "URL should be written scheme://host"
        )
    return url


LiveKitUrl = Annotated[str, AfterValidator(_check_livekit_url)]


class LiveKitClusterSpec(BaseModel):
    """A LiveKit cluster, as listed in LIVEKIT_CLUSTERS.

    Browsers connect to `url` and Django calls `api_url`, which defaults to
    `url`. Each cluster has its own API key, which tells it apart.
    """

    name: Annotated[str, StringConstraints(pattern=LIVEKIT_CLUSTER_NAME_PATTERN)]
    url: LiveKitUrl
    api_url: LiveKitUrl | None = None
    api_key: Annotated[str, StringConstraints(min_length=1)]
    api_secret: Annotated[SecretStr, Field(min_length=1)]
    weight: NonNegativeInt = 1

    model_config = {"extra": "forbid"}


_LIVEKIT_CLUSTERS_ADAPTER = TypeAdapter(
    Annotated[list[LiveKitClusterSpec], Field(min_length=1)]
)


def _locate(loc) -> str:
    """Name a place in LIVEKIT_CLUSTERS, such as LIVEKIT_CLUSTERS[0].url."""
    return "LIVEKIT_CLUSTERS" + "".join(
        f"[{part}]" if isinstance(part, int) else f".{part}" for part in loc
    )


def _find_duplicates(specs: list[LiveKitClusterSpec]) -> list[str]:
    """Describe each cluster reusing the name or the API key of an earlier one."""
    problems = []
    first_by_name = {}
    first_by_api_key = {}
    for index, spec in enumerate(specs):
        first = first_by_name.setdefault(spec.name, index)
        if first != index:
            problems.append(
                f"{_locate((index, 'name'))}: {spec.name!r} is already the name "
                f"of {_locate((first,))}"
            )
        first = first_by_api_key.setdefault(spec.api_key, index)
        if first != index:
            problems.append(
                f"{_locate((index, 'api_key'))}: {_locate((first,))} already uses "
                "this API key, each LiveKit cluster needs its own"
            )
    return problems


def parse_livekit_clusters(raw: str) -> list[LiveKitClusterSpec]:
    """Parse LIVEKIT_CLUSTERS, a non-empty JSON list of LiveKit clusters.

    The first cluster is the default one. Names and API keys must be unique.
    Every problem found is reported in a single ValueError.
    """
    specs = []
    problems = []
    try:
        specs = _LIVEKIT_CLUSTERS_ADAPTER.validate_json(raw, strict=True)
    except ValidationError as error:
        problems = [
            f"{_locate(problem['loc'])}: {problem['msg']}"
            for problem in error.errors(include_input=False, include_url=False)
        ]
    problems += _find_duplicates(specs)
    if problems:
        raise ValueError("; ".join(problems))
    return specs
