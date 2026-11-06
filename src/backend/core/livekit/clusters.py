"""Registry of the LiveKit clusters on which Django places rooms."""

from dataclasses import dataclass, field
from functools import lru_cache

from django.conf import settings

from .exceptions import UnknownLiveKitClusterError
from .specs import parse_livekit_clusters

FALLBACK_LIVEKIT_CLUSTER_NAME = "default"


@dataclass(frozen=True, kw_only=True)
class LiveKitClusterConfig:
    """How browsers and Django reach a LiveKit cluster.

    Browsers connect to `url` and Django calls `api_url`. The API secret is
    left out of the representation, which may end up in logs.
    """

    name: str
    url: str
    api_url: str
    api_key: str
    api_secret: str = field(repr=False)
    weight: int = 1


@lru_cache(maxsize=8)
def _clusters_from_json(raw: str) -> tuple[LiveKitClusterConfig, ...]:
    """Build the LiveKit clusters listed in a value of LIVEKIT_CLUSTERS."""
    return tuple(
        LiveKitClusterConfig(
            name=spec.name,
            url=spec.url,
            api_url=spec.api_url or spec.url,
            api_key=spec.api_key,
            api_secret=spec.api_secret.get_secret_value(),
            weight=spec.weight,
        )
        for spec in parse_livekit_clusters(raw)
    )


@lru_cache(maxsize=8)
def _clusters_from_configuration(
    url: str, api_key: str, api_secret: str
) -> tuple[LiveKitClusterConfig, ...]:
    """Build the single LiveKit cluster that LIVEKIT_CONFIGURATION describes."""
    return (
        LiveKitClusterConfig(
            name=FALLBACK_LIVEKIT_CLUSTER_NAME,
            url=url,
            api_url=url,
            api_key=api_key,
            api_secret=api_secret,
        ),
    )


def get_livekit_clusters() -> tuple[LiveKitClusterConfig, ...]:
    """Return the registered LiveKit clusters, the default one first.

    LIVEKIT_CLUSTERS settings lists them. When it is unset, a single cluster named
    "default" is built from LIVEKIT_CONFIGURATION.
    """
    if settings.LIVEKIT_CLUSTERS is not None:
        return _clusters_from_json(settings.LIVEKIT_CLUSTERS)
    configuration = settings.LIVEKIT_CONFIGURATION
    return _clusters_from_configuration(
        configuration["url"],
        configuration["api_key"],
        configuration["api_secret"],
    )


def get_default_livekit_cluster() -> LiveKitClusterConfig:
    """Return the default LiveKit cluster: the first registered one."""
    return get_livekit_clusters()[0]


def get_livekit_cluster(name: str) -> LiveKitClusterConfig:
    """Return the registered LiveKit cluster with this name."""
    for cluster in get_livekit_clusters():
        if cluster.name == name:
            return cluster
    raise UnknownLiveKitClusterError(f"No LiveKit cluster is named {name!r}.")


def get_livekit_cluster_by_api_key(api_key: str | None) -> LiveKitClusterConfig | None:
    """Return the registered LiveKit cluster using this API key, if any."""
    if not api_key:
        return None
    for cluster in get_livekit_clusters():
        if cluster.api_key == api_key:
            return cluster
    return None
