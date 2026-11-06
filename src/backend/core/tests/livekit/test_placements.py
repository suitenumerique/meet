"""Unit tests for the placements of LiveKit rooms on the LiveKit clusters."""

import json
import logging

import pytest

from core.livekit.clusters import get_default_livekit_cluster
from core.livekit.placements import PlacementService
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
