"""Unit tests for the registry of LiveKit clusters."""

import dataclasses
import json

import pytest

from core.livekit.clusters import (
    LiveKitClusterConfig,
    get_default_livekit_cluster,
    get_livekit_cluster,
    get_livekit_cluster_by_api_key,
    get_livekit_clusters,
)
from core.livekit.exceptions import UnknownLiveKitClusterError
from core.tests.utils import livekit_cluster_entry

PARIS = LiveKitClusterConfig(
    name="paris",
    url="wss://paris.livekit.test",
    api_url="wss://paris.livekit.test",
    api_key="key-paris",
    api_secret="secret-paris-padded-for-minimum-len!-livekit",
)
LYON = LiveKitClusterConfig(
    name="lyon",
    url="wss://lyon.livekit.test",
    api_url="http://livekit.lyon.svc:7880",
    api_key="key-lyon",
    api_secret="secret-lyon-padded-for-minimum-len!-livekit",
    weight=0,
)


@pytest.fixture
def two_clusters(settings):
    """Register the Paris and Lyon LiveKit clusters, Paris being the default."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry("paris"),
            livekit_cluster_entry(
                "lyon",
                api_url="http://livekit.lyon.svc:7880",
                weight=0,
            ),
        ]
    )


def test_get_livekit_clusters_from_livekit_configuration(settings):
    """Without LIVEKIT_CLUSTERS, LIVEKIT_CONFIGURATION describes a single cluster.

    It is named "default" and its URL serves both browsers and Django.
    """
    configuration = settings.LIVEKIT_CONFIGURATION

    assert settings.LIVEKIT_CLUSTERS is None
    assert get_livekit_clusters() == (
        LiveKitClusterConfig(
            name="default",
            url=configuration["url"],
            api_url=configuration["url"],
            api_key=configuration["api_key"],
            api_secret=configuration["api_secret"],
            weight=1,
        ),
    )


@pytest.mark.usefixtures("two_clusters")
def test_get_livekit_clusters_from_livekit_clusters():
    """LIVEKIT_CLUSTERS lists the clusters in order, api_url defaulting to url."""
    assert get_livekit_clusters() == (PARIS, LYON)


def test_get_livekit_clusters_follows_settings_changes(settings):
    """The clusters are cached on the raw settings, so a change applies at once."""
    clusters = get_livekit_clusters()
    assert get_livekit_clusters() is clusters

    settings.LIVEKIT_CONFIGURATION = {
        **settings.LIVEKIT_CONFIGURATION,
        "url": "wss://elsewhere.livekit.test",
    }
    assert get_livekit_clusters()[0].url == "wss://elsewhere.livekit.test"

    settings.LIVEKIT_CLUSTERS = json.dumps([livekit_cluster_entry("paris")])
    assert get_livekit_clusters() == (PARIS,)

    settings.LIVEKIT_CLUSTERS = json.dumps([livekit_cluster_entry("lille")])
    assert [cluster.name for cluster in get_livekit_clusters()] == ["lille"]


def test_get_livekit_clusters_invalid_livekit_clusters(settings):
    """An invalid LIVEKIT_CLUSTERS is refused at runtime as it is at startup."""
    settings.LIVEKIT_CLUSTERS = "[]"

    with pytest.raises(ValueError, match="LIVEKIT_CLUSTERS"):
        get_livekit_clusters()


@pytest.mark.usefixtures("two_clusters")
def test_get_default_livekit_cluster():
    """The default cluster is the first one listed."""
    assert get_default_livekit_cluster() == PARIS


def test_get_default_livekit_cluster_from_livekit_configuration():
    """Without LIVEKIT_CLUSTERS, the default cluster is the one named "default"."""
    assert get_default_livekit_cluster() == get_livekit_clusters()[0]
    assert get_default_livekit_cluster().name == "default"


@pytest.mark.usefixtures("two_clusters")
def test_get_livekit_cluster():
    """A cluster is found by its name."""
    assert get_livekit_cluster("lyon") == LYON
    assert get_livekit_cluster("paris") == PARIS


@pytest.mark.usefixtures("two_clusters")
def test_get_livekit_cluster_unknown():
    """An unknown name raises an error naming it."""
    with pytest.raises(
        UnknownLiveKitClusterError, match="No LiveKit cluster is named 'default'."
    ):
        get_livekit_cluster("default")


@pytest.mark.usefixtures("two_clusters")
def test_get_livekit_cluster_by_api_key():
    """A cluster is found by its API key."""
    assert get_livekit_cluster_by_api_key("key-lyon") == LYON
    assert get_livekit_cluster_by_api_key("key-paris") == PARIS


@pytest.mark.usefixtures("two_clusters")
@pytest.mark.parametrize("api_key", ["key-lille", "KEY-LYON", "", None])
def test_get_livekit_cluster_by_api_key_unknown(api_key):
    """An API key no cluster uses finds none."""
    assert get_livekit_cluster_by_api_key(api_key) is None


@pytest.mark.parametrize("api_key", ["", None])
def test_get_livekit_cluster_by_api_key_unset(settings, api_key):
    """A missing API key finds no cluster, not even one whose key is unset."""
    settings.LIVEKIT_CONFIGURATION = {
        "url": None,
        "api_key": api_key,
        "api_secret": None,
    }

    assert get_livekit_clusters()[0].api_key == api_key
    assert get_livekit_cluster_by_api_key(api_key) is None


def test_livekit_cluster_config_hides_the_api_secret():
    """The API secret stays out of the representation, which may end up in logs."""
    assert PARIS.api_secret not in repr(PARIS)
    assert PARIS.api_secret not in str(PARIS)
    assert "key-paris" in repr(PARIS)


def test_livekit_cluster_config_is_frozen():
    """A cluster is shared between callers, so it cannot be changed."""
    with pytest.raises(dataclasses.FrozenInstanceError):
        PARIS.url = "wss://elsewhere.livekit.test"
