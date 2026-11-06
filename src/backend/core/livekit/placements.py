"""Placements of LiveKit rooms on the LiveKit clusters.

A placement records the LiveKit cluster a LiveKit room lives on, from the first
credentials handed out for it until the LiveKit room finishes.
"""

from logging import getLogger

from core.models import Placement

from .clusters import LiveKitClusterConfig, get_livekit_clusters

logger = getLogger(__name__)


class PlacementService:
    """Service for the placements of LiveKit rooms on LiveKit clusters."""

    @classmethod
    def cluster_for(cls, room_name: str) -> LiveKitClusterConfig:
        """Return the LiveKit cluster on which a LiveKit room is managed.

        With a single registered cluster, every room lives there, and the
        database is not queried. Otherwise it is the cluster of the room's
        placement, as long as that cluster is registered. Rooms without
        placement, either live since before placements existed or not placed
        yet, and rooms placed on a cluster since removed from the registry, are
        managed on the default cluster.
        """
        clusters = get_livekit_clusters()
        default_cluster = clusters[0]
        if len(clusters) == 1:
            return default_cluster

        placed_on = (
            Placement.objects.filter(room_name=room_name)
            .values_list("cluster", flat=True)
            .first()
        )
        if placed_on is None:
            return default_cluster

        for cluster in clusters:
            if cluster.name == placed_on:
                return cluster

        logger.warning(
            "LiveKit room %s is placed on LiveKit cluster %s, which is not "
            "registered: managing it on the default cluster %s",
            room_name,
            placed_on,
            default_cluster.name,
        )
        return default_cluster
