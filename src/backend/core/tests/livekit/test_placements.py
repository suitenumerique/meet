"""Unit tests for the placements of LiveKit rooms on the LiveKit clusters."""

import json
import logging
from unittest import mock

import pytest

from core.factories import RoomFactory
from core.livekit.clusters import get_default_livekit_cluster
from core.livekit.exceptions import NoCandidateLiveKitClusterError
from core.livekit.placements import PlacementService
from core.livekit.strategies import PlacementContext, WeightedRandomStrategy
from core.models import Placement
from core.tests.utils import livekit_cluster_entry

pytestmark = pytest.mark.django_db


def test_cluster_for_single_cluster(django_assert_num_queries):
    """With a single cluster, every room lives there and placements are not read."""
    Placement.objects.create(room_name="my-room", cluster="lyon")

    with django_assert_num_queries(0):
        cluster = PlacementService.cluster_for("my-room")

    assert cluster == get_default_livekit_cluster()
    assert cluster.name == "default"


def test_cluster_for_single_listed_cluster(settings, django_assert_num_queries):
    """A single cluster listed in LIVEKIT_CLUSTERS is the only one too."""
    settings.LIVEKIT_CLUSTERS = json.dumps([livekit_cluster_entry("paris")])
    Placement.objects.create(room_name="my-room", cluster="lyon")

    with django_assert_num_queries(0):
        cluster = PlacementService.cluster_for("my-room")

    assert cluster.name == "paris"


def test_cluster_for_placed_room(two_livekit_clusters, django_assert_num_queries):
    """A placed room lives on the cluster of its placement."""
    _paris, lyon = two_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="lyon")
    Placement.objects.create(room_name="other-room", cluster="paris")

    with django_assert_num_queries(1):
        cluster = PlacementService.cluster_for("my-room")

    assert cluster == lyon


def test_cluster_for_room_without_placement(two_livekit_clusters):
    """A room without placement is managed on the default cluster.

    It may have been live since before placements existed, or not be placed yet.
    """
    paris, _lyon = two_livekit_clusters
    Placement.objects.create(room_name="other-room", cluster="lyon")

    assert PlacementService.cluster_for("my-room") == paris


def test_cluster_for_unregistered_cluster(two_livekit_clusters, caplog):
    """A room placed on a cluster since removed from the registry is managed on
    the default cluster, with a warning."""
    paris, _lyon = two_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="lille")

    with caplog.at_level(logging.WARNING, logger="core.livekit.placements"):
        cluster = PlacementService.cluster_for("my-room")

    assert cluster == paris
    assert (
        "LiveKit room my-room is placed on LiveKit cluster lille, which is not "
        "registered: managing it on the default cluster paris"
    ) in caplog.text


def test_candidates(two_livekit_clusters):
    """Every registered cluster may receive new placements, in registry order."""
    assert PlacementService.candidates() == two_livekit_clusters


def test_candidates_weighing_zero(settings):
    """Clusters weighing 0 receive no new placements."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry("paris", weight=0),
            livekit_cluster_entry("lyon", weight=2),
            livekit_cluster_entry("marseille", weight=0),
            livekit_cluster_entry("lille"),
        ]
    )

    assert [cluster.name for cluster in PlacementService.candidates()] == [
        "lyon",
        "lille",
    ]


def test_choose_cluster_single_cluster():
    """With a single cluster, every LiveKit room is placed there."""
    assert PlacementService.choose_cluster("my-room") == get_default_livekit_cluster()


@pytest.mark.parametrize("registered", (True, False))
def test_choose_cluster(registered, two_livekit_clusters):
    """The placement strategy picks among the candidates, knowing the LiveKit
    room's name and the room it is named after, if any."""
    paris, lyon = two_livekit_clusters
    room = RoomFactory() if registered else None
    room_name = str(room.id) if registered else "my-room"

    with mock.patch.object(
        WeightedRandomStrategy, "choose", autospec=True, return_value=lyon
    ) as choose:
        cluster = PlacementService.choose_cluster(room_name, room)

    assert cluster == lyon
    choose.assert_called_once_with(
        mock.ANY, (paris, lyon), PlacementContext(room_name=room_name, room=room)
    )


def test_choose_cluster_never_weighing_zero(settings):
    """A cluster weighing 0 is never picked. By default, each candidate is picked
    for a share of the draws equal to its share of the total weight."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry("paris", weight=0),
            livekit_cluster_entry("lyon"),
            livekit_cluster_entry("lille", weight=3),
        ]
    )

    with mock.patch(
        "core.livekit.strategies.SystemRandom.random",
        side_effect=[(draw + 0.5) / 4 for draw in range(4)],
    ):
        picked = [PlacementService.choose_cluster("my-room").name for _draw in range(4)]

    assert picked == ["lyon", "lille", "lille", "lille"]


def test_choose_cluster_with_the_strategy_set(two_livekit_clusters, settings):
    """LIVEKIT_PLACEMENT_STRATEGY names the placement strategy, which picks the
    cluster where the default one would draw another."""
    _paris, lyon = two_livekit_clusters
    settings.LIVEKIT_PLACEMENT_STRATEGY = (
        "core.livekit.strategies.LeastPlacementsStrategy"
    )
    Placement.objects.create(room_name="other-room", cluster="paris")

    with mock.patch("core.livekit.strategies.SystemRandom.random", return_value=0.25):
        assert PlacementService.choose_cluster("my-room") == lyon


def test_choose_cluster_without_candidate(settings, caplog):
    """With every cluster weighing 0, no LiveKit room can be placed: this is
    logged as critical."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry("paris", weight=0),
            livekit_cluster_entry("lyon", weight=0),
        ]
    )

    with (
        caplog.at_level(logging.CRITICAL, logger="core.livekit.placements"),
        pytest.raises(
            NoCandidateLiveKitClusterError,
            match="No LiveKit cluster may receive new placements",
        ),
    ):
        PlacementService.choose_cluster("my-room")

    assert [record.levelname for record in caplog.records] == ["CRITICAL"]
    assert (
        "No LiveKit cluster may receive new placements: LiveKit room my-room "
        "cannot be placed"
    ) in caplog.text
