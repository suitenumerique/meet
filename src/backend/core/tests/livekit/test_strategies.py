"""Unit tests for the placement strategies picking the LiveKit cluster of new
placements."""

import secrets
from unittest import mock

from django.core.cache import cache

import pytest

from core.livekit.clusters import LiveKitClusterConfig
from core.livekit.strategies import (
    LeastPlacementsStrategy,
    PlacementContext,
    RoundRobinStrategy,
    WeightedRandomStrategy,
    get_placement_strategy,
)
from core.models import Placement

from meet import settings as meet_settings

CONTEXT = PlacementContext(room_name="my-room")


def livekit_cluster(name, weight=1):
    """Return a LiveKit cluster with this name and weight."""
    return LiveKitClusterConfig(
        name=name,
        url=f"wss://{name}.livekit.test",
        api_url=f"wss://{name}.livekit.test",
        api_key=f"key-{name}",
        api_secret=f"secret-{name}-padded-for-minimum-len!-livekit",
        weight=weight,
    )


def test_get_placement_strategy_default():
    """By default, LiveKit clusters are picked at random, in proportion to their
    weights."""
    assert isinstance(get_placement_strategy(), WeightedRandomStrategy)


def test_get_placement_strategy_set(settings):
    """The strategy named by LIVEKIT_PLACEMENT_STRATEGY is looked up on every call."""
    settings.LIVEKIT_PLACEMENT_STRATEGY = "core.livekit.strategies.RoundRobinStrategy"

    assert isinstance(get_placement_strategy(), RoundRobinStrategy)

    settings.LIVEKIT_PLACEMENT_STRATEGY = (
        "core.livekit.strategies.LeastPlacementsStrategy"
    )

    assert isinstance(get_placement_strategy(), LeastPlacementsStrategy)


def test_get_placement_strategy_not_imported_while_settings_load():
    """The settings load without importing the placement strategy.

    A strategy may need applications that are not ready while the settings load.
    """
    with mock.patch.object(
        meet_settings.Test,
        "LIVEKIT_PLACEMENT_STRATEGY",
        "core.livekit.missing.Strategy",
    ):
        meet_settings.Test.post_setup()


def test_weighted_random_strategy():
    """Each candidate is picked for a share of the draws equal to its share of the
    total weight."""
    candidates = (
        livekit_cluster("paris", weight=1),
        livekit_cluster("lyon", weight=3),
        livekit_cluster("lille", weight=2),
    )

    with mock.patch(
        "core.livekit.strategies.SystemRandom.random",
        side_effect=[(draw + 0.5) / 6 for draw in range(6)],
    ):
        picked = [
            WeightedRandomStrategy().choose(candidates, CONTEXT).name
            for _draw in range(6)
        ]

    assert picked == ["paris", "lyon", "lyon", "lyon", "lille", "lille"]


def test_weighted_random_strategy_single_candidate():
    """A single candidate is always picked, whatever its weight."""
    lyon = livekit_cluster("lyon", weight=5)

    assert WeightedRandomStrategy().choose((lyon,), CONTEXT) == lyon


@pytest.fixture(name="round_robin_clusters")
def round_robin_clusters_fixture():
    """Return three LiveKit clusters of different weights, named for this test
    alone.

    Turns are counted in the cache, which tests running in parallel share and
    which outlives them, so the counters of the first one, two and three of
    these clusters are deleted afterwards.
    """
    suffix = secrets.token_hex(4)
    clusters = tuple(
        livekit_cluster(f"{name}-{suffix}", weight=weight)
        for name, weight in (("paris", 1), ("lyon", 3), ("lille", 2))
    )
    yield clusters
    cache.delete_many(
        [RoundRobinStrategy.counter_key(clusters[:size]) for size in (1, 2, 3)]
    )


def test_round_robin_strategy(round_robin_clusters):
    """Candidates are picked in turn, whatever their weights, the turns being
    shared by every instance of the strategy."""
    paris, lyon, lille = round_robin_clusters

    picked = [
        RoundRobinStrategy().choose(round_robin_clusters, CONTEXT) for _turn in range(7)
    ]

    assert picked == [paris, lyon, lille, paris, lyon, lille, paris]


def test_round_robin_strategy_turns_per_candidates(round_robin_clusters):
    """Each set of candidates has turns of its own."""
    paris, lyon, lille = round_robin_clusters
    strategy = RoundRobinStrategy()

    assert strategy.choose((paris, lyon, lille), CONTEXT) == paris
    assert strategy.choose((paris, lyon), CONTEXT) == paris
    assert strategy.choose((paris, lyon, lille), CONTEXT) == lyon
    assert strategy.choose((paris, lyon), CONTEXT) == lyon
    assert strategy.choose((paris, lyon), CONTEXT) == paris
    assert strategy.choose((paris, lyon, lille), CONTEXT) == lille


def test_round_robin_strategy_counter_lost(round_robin_clusters):
    """Should the counter vanish right after its creation, the turn goes to the
    first candidate, and turns start over."""
    paris, lyon, _lille = round_robin_clusters
    strategy = RoundRobinStrategy()
    assert strategy.choose(round_robin_clusters, CONTEXT) == paris
    assert strategy.choose(round_robin_clusters, CONTEXT) == lyon
    key = RoundRobinStrategy.counter_key(round_robin_clusters)

    with mock.patch.object(
        cache, "add", side_effect=lambda *args, **kwargs: cache.delete(key)
    ):
        assert strategy.choose(round_robin_clusters, CONTEXT) == paris

    assert strategy.choose(round_robin_clusters, CONTEXT) == paris
    assert strategy.choose(round_robin_clusters, CONTEXT) == lyon


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("placements", "picked"),
    (
        ({}, "paris"),
        ({"paris": 1}, "lyon"),
        ({"paris": 1, "lyon": 2}, "lyon"),
        ({"paris": 1, "lyon": 3}, "paris"),
        ({"paris": 1, "lyon": 4}, "paris"),
    ),
)
def test_least_placements_strategy(placements, picked, django_assert_num_queries):
    """The candidate holding the fewest placements for its weight is picked, the
    first one on a tie, with a single query."""
    candidates = (
        livekit_cluster("paris", weight=1),
        livekit_cluster("lyon", weight=3),
    )
    for cluster, count in placements.items():
        for index in range(count):
            Placement.objects.create(room_name=f"{cluster}-{index}", cluster=cluster)

    with django_assert_num_queries(1):
        chosen = LeastPlacementsStrategy().choose(candidates, CONTEXT)

    assert chosen.name == picked


@pytest.mark.django_db
def test_least_placements_strategy_tie():
    """On a tie, the candidate registered first is picked."""
    paris = livekit_cluster("paris", weight=1)
    lyon = livekit_cluster("lyon", weight=2)
    Placement.objects.create(room_name="paris-0", cluster="paris")
    Placement.objects.create(room_name="lyon-0", cluster="lyon")
    Placement.objects.create(room_name="lyon-1", cluster="lyon")

    assert LeastPlacementsStrategy().choose((paris, lyon), CONTEXT) == paris
    assert LeastPlacementsStrategy().choose((lyon, paris), CONTEXT) == lyon
