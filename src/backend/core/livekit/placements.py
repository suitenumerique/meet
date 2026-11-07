"""Placements of LiveKit rooms on the LiveKit clusters.

A placement records the LiveKit cluster a LiveKit room lives on, from the first
credentials handed out for it until the LiveKit room finishes.
"""

from logging import getLogger

from core.models import Placement, Room

from .clusters import LiveKitClusterConfig, get_livekit_clusters
from .exceptions import NoCandidateLiveKitClusterError
from .strategies import PlacementContext, get_placement_strategy

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

    @classmethod
    def candidates(cls) -> tuple[LiveKitClusterConfig, ...]:
        """Return the LiveKit clusters that may receive new placements.

        They are the registered clusters, in registry order, but for those
        weighing 0, which keep their live rooms and receive no new placement.
        """
        return tuple(
            cluster for cluster in get_livekit_clusters() if cluster.weight > 0
        )

    @classmethod
    def choose_cluster(
        cls, room_name: str, room: Room | None = None
    ) -> LiveKitClusterConfig:
        """Return the LiveKit cluster on which to place a LiveKit room.

        The placement strategy named by LIVEKIT_PLACEMENT_STRATEGY picks it
        among the candidates, knowing the LiveKit room's name and the room it is
        named after, if any. Without any candidate, no LiveKit room can be
        placed anywhere: this is logged as critical and raises
        NoCandidateLiveKitClusterError.
        """
        candidates = cls.candidates()
        if not candidates:
            logger.critical(
                "No LiveKit cluster may receive new placements: LiveKit room %s "
                "cannot be placed",
                room_name,
            )
            raise NoCandidateLiveKitClusterError(
                "No LiveKit cluster may receive new placements."
            )
        context = PlacementContext(room_name=room_name, room=room)
        return get_placement_strategy().choose(candidates, context)
