"""Unit tests for the registry of LiveKit clusters."""

import dataclasses
import json
import time
from datetime import timedelta

import jwt
import pytest
from livekit.api import AccessToken, VideoGrants
from livekit.api.access_token import Claims

from core.livekit.clusters import (
    LiveKitClusterConfig,
    LiveKitClusterTokenVerifier,
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


def livekit_token(api_key, api_secret, ttl_minutes=60):
    """Return a participant token signed with this API key and secret."""
    return (
        AccessToken(api_key=api_key, api_secret=api_secret)
        .with_identity("participant-1")
        .with_grants(VideoGrants(room="my-room", room_join=True))
        .with_ttl(timedelta(minutes=ttl_minutes))
        .to_jwt()
    )


@pytest.mark.usefixtures("two_clusters")
@pytest.mark.parametrize("cluster", [PARIS, LYON], ids=["paris", "lyon"])
def test_livekit_cluster_token_verifier(cluster):
    """A token signed by any registered cluster is verified with its keys.

    The claims carry that cluster, and so does the verifier.
    """
    verifier = LiveKitClusterTokenVerifier()

    claims = verifier.verify(livekit_token(cluster.api_key, cluster.api_secret))

    assert isinstance(claims, Claims)
    assert claims.identity == "participant-1"
    assert claims.video.room == "my-room"
    assert claims.cluster == cluster
    assert verifier.cluster == cluster


def test_livekit_cluster_token_verifier_from_livekit_configuration(settings):
    """Without LIVEKIT_CLUSTERS, tokens are verified with LIVEKIT_CONFIGURATION."""
    configuration = settings.LIVEKIT_CONFIGURATION

    claims = LiveKitClusterTokenVerifier().verify(
        livekit_token(configuration["api_key"], configuration["api_secret"])
    )

    assert claims.cluster == get_default_livekit_cluster()
    assert claims.cluster.name == "default"


@pytest.mark.usefixtures("two_clusters")
def test_livekit_cluster_token_verifier_unknown_api_key():
    """A token whose API key no cluster uses is refused as having a wrong issuer."""
    verifier = LiveKitClusterTokenVerifier()
    token = livekit_token("key-lille", "secret-lille-padded-for-minimum-len!-livekit")

    with pytest.raises(jwt.InvalidIssuerError, match="Invalid issuer"):
        verifier.verify(token)

    assert verifier.cluster is None


@pytest.mark.usefixtures("two_clusters")
def test_livekit_cluster_token_verifier_missing_issuer():
    """A token without issuer names no cluster and is refused."""
    token = jwt.encode(
        {"sub": "participant-1", "exp": int(time.time()) + 3600},
        PARIS.api_secret,
        algorithm="HS256",
    )

    with pytest.raises(jwt.MissingRequiredClaimError, match='"iss"'):
        LiveKitClusterTokenVerifier().verify(token)


@pytest.mark.usefixtures("two_clusters")
def test_livekit_cluster_token_verifier_signed_by_another_cluster():
    """A token issued with the API key of a cluster must be signed with its secret.

    A cluster cannot sign tokens in the name of another one.
    """
    token = livekit_token(LYON.api_key, PARIS.api_secret)

    with pytest.raises(jwt.InvalidSignatureError):
        LiveKitClusterTokenVerifier().verify(token)


@pytest.mark.usefixtures("two_clusters")
def test_livekit_cluster_token_verifier_expired():
    """A token from a registered cluster is still checked as any token is."""
    token = livekit_token(LYON.api_key, LYON.api_secret, ttl_minutes=-5)

    with pytest.raises(jwt.ExpiredSignatureError):
        LiveKitClusterTokenVerifier().verify(token)
