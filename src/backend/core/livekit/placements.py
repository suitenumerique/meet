"""Placements of LiveKit rooms on the LiveKit clusters.

A placement records the LiveKit cluster a LiveKit room lives on, from the first
credentials handed out for it until the LiveKit room finishes. Only rooms whose
lifecycle Django follows are placed: unregistered rooms never are, and live on
the default cluster.
"""

from logging import getLogger

from django.utils import timezone

from core.models import Placement, Room

from .clusters import LiveKitClusterConfig, get_livekit_clusters
from .exceptions import (
    LiveKitRoomCreationError,
    NoCandidateLiveKitClusterError,
    PlacementChangedError,
)
from .strategies import PlacementContext, get_placement_strategy

logger = getLogger(__name__)

PLACEMENT_CREATION_ATTEMPTS = 3
PLACEMENT_UPDATE_ATTEMPTS = 2


class PlacementService:
    """Service for the placements of LiveKit rooms on LiveKit clusters."""

    @classmethod
    def cluster_for(cls, room_name: str) -> LiveKitClusterConfig:
        """Return the LiveKit cluster on which a LiveKit room is managed.

        With a single registered cluster, every room lives there, and the
        database is not queried. Otherwise it is the cluster of the room's
        placement, as long as that cluster is registered. Rooms without
        placement, either unregistered, live since before placements existed or
        not placed yet, and rooms placed on a cluster since removed from the
        registry, are managed on the default cluster.
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

    @classmethod
    def place(cls, room_name: str, room: Room | None = None) -> LiveKitClusterConfig:
        """Make a LiveKit room ready to be joined and return its LiveKit cluster.

        A LiveKit room without placement is placed on the cluster the placement
        strategy picks. A placement is deleted for non registered cluster and also
        when the LiveKit room creation fails. The room will be placed again on retry.
        """
        # pylint: disable-next=import-outside-toplevel,cyclic-import
        from core.services import room_management  # noqa: PLC0415

        for _attempt in range(PLACEMENT_UPDATE_ATTEMPTS):
            placement, cluster, created = cls._get_or_create_placement(room_name, room)
            try:
                sid = room_management.RoomManagement.create_room(
                    room_name, cluster=cluster
                )
            except LiveKitRoomCreationError:
                if created:
                    cls._delete_created_placement(placement, cluster)
                raise

            if Placement.objects.filter(
                pk=placement.pk, epoch=placement.epoch, sid__in=(placement.sid, sid)
            ).update(sid=sid, absent_since=None, updated_at=timezone.now()):
                return cluster

            logger.info(
                "Placement of LiveKit room %s changed while LiveKit cluster %s "
                "created it: reading it again",
                room_name,
                cluster.name,
            )

        logger.warning(
            "Placement of LiveKit room %s kept changing while its LiveKit room "
            "was created",
            room_name,
        )
        raise PlacementChangedError(
            f"The placement of LiveKit room {room_name} kept changing."
        )

    @classmethod
    def _get_or_create_placement(
        cls, room_name: str, room: Room | None
    ) -> tuple[Placement, LiveKitClusterConfig, bool]:
        """Return the placement of a LiveKit room, placing if needed.

        For new placements, concurrent creations are dealt with by the unique
        constraint on room_name: each request reads the placement back after
        inserting it, which is way less intense than relying on PostgreSQL
        advisory locks. On conflict, the LiveKit room is placed again, a bounded
        number of times, and its placement deleted when it is on a cluster no
        longer registered.
        """
        clusters = {cluster.name: cluster for cluster in get_livekit_clusters()}
        for _attempt in range(PLACEMENT_CREATION_ATTEMPTS):
            created = False
            placement = Placement.objects.filter(room_name=room_name).first()
            if placement is None:
                chosen_cluster = cls.choose_cluster(room_name, room)
                new_placement = Placement(
                    room_name=room_name,
                    room=room,
                    cluster=chosen_cluster.name,
                )
                Placement.objects.bulk_create([new_placement], ignore_conflicts=True)
                placement = Placement.objects.filter(room_name=room_name).first()
                if placement is None:
                    continue
                created = placement.pk == new_placement.pk
                if created:
                    logger.info(
                        "Placed LiveKit room %s on LiveKit cluster %s",
                        room_name,
                        placement.cluster,
                    )

            cluster = clusters.get(placement.cluster)
            if cluster is not None:
                return placement, cluster, created

            logger.warning(
                "LiveKit room %s is placed on LiveKit cluster %s, which is not "
                "registered: placing it again",
                room_name,
                placement.cluster,
            )
            Placement.objects.filter(
                pk=placement.pk, epoch=placement.epoch, cluster=placement.cluster
            ).delete()

        raise PlacementChangedError(
            f"The placement of LiveKit room {room_name} kept changing."
        )

    @staticmethod
    def _delete_created_placement(placement: Placement, cluster: LiveKitClusterConfig):
        """Delete a placement whose LiveKit room its cluster failed to create.

        It is deleted only while it still has the epoch read and no SID: no one
        was handed out credentials for it then.
        """
        deleted, _ = Placement.objects.filter(
            pk=placement.pk, epoch=placement.epoch, sid=""
        ).delete()
        if deleted:
            logger.info(
                "Deleted the placement of LiveKit room %s on LiveKit cluster %s, "
                "which failed to create it",
                placement.room_name,
                cluster.name,
            )
