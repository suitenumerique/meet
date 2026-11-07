"""Placements of LiveKit rooms on the LiveKit clusters.

A placement records the LiveKit cluster a LiveKit room lives on, from the first
credentials handed out for it until the LiveKit room finishes. Only rooms whose
lifecycle Django follows are placed: unregistered rooms never are, and live on
the default cluster.
"""

from logging import getLogger
from typing import Any
from uuid import uuid4

from django.db.models import F
from django.utils import timezone

from core import audit, auditing
from core.models import Placement, Room

from .clusters import LiveKitClusterConfig, get_livekit_clusters
from .exceptions import (
    LiveKitRoomCreationError,
    NoCandidateLiveKitClusterError,
    PlacementChangedError,
    RelocationRefusedError,
)
from .strategies import PlacementContext, get_placement_strategy

logger = getLogger(__name__)

PLACEMENT_CREATION_ATTEMPTS = 3
PLACEMENT_UPDATE_ATTEMPTS = 2


def _audit(action: audit.Action, actor: Any, **fields: Any) -> None:
    """Emit the audit event of an action taken by an actor, the system when None."""
    audit.log(
        action,
        actor=actor,
        actor_type=audit.ActorType.SYSTEM if actor is None else None,
        **fields,
    )


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

    @classmethod
    def relocate(
        cls, room_name: str, to: str | None = None, *, actor: Any
    ) -> LiveKitClusterConfig:
        """Relocate a room to another LiveKit cluster and return that cluster.

        The placement of its LiveKit room moves to the candidate named `to`, or
        else to the one the placement strategy picks among the candidates other
        than its current cluster. Credentials are then handed out for the new
        cluster, where the next join creates the LiveKit room. The LiveKit room
        is closed on the cluster it leaves, which tells its participants to ask
        Django again where to connect.

        `actor` is who relocates the room, as recorded in the audit log: a user,
        such as one acting through the admin, or None for the system.
        """
        source, target = cls._move_placement(room_name, to)
        relocation_id = str(uuid4())
        logger.info(
            "Relocated LiveKit room %s from LiveKit cluster %s to LiveKit cluster %s",
            room_name,
            source.name,
            target.name,
        )
        _audit(
            auditing.LIVEKIT_PLACEMENT_RELOCATE,
            actor,
            target=auditing.livekit_room_target(room_name),
            source_cluster=source.name,
            target_cluster=target.name,
            relocation_id=relocation_id,
        )
        cls._close_livekit_room(source, room_name, relocation_id, actor=actor)
        return target

    @classmethod
    def _move_placement(
        cls, room_name: str, to: str | None
    ) -> tuple[LiveKitClusterConfig, LiveKitClusterConfig]:
        """Move the placement of a LiveKit room to another LiveKit cluster.

        Return the cluster it left and the one it moved to. The move bumps its
        epoch and records the cluster it left, and when. It clears the SID and
        the absence, which were those of the LiveKit room on the cluster left:
        the LiveKit room gets a SID once created on the new cluster.
        """
        placement = (
            Placement.objects.select_related("room").filter(room_name=room_name).first()
        )
        if placement is None:
            raise RelocationRefusedError(f"LiveKit room {room_name} is not placed.")

        source, target = cls._relocation_clusters(placement, to)
        now = timezone.now()
        if not Placement.objects.filter(
            pk=placement.pk, epoch=placement.epoch, cluster=source.name
        ).update(
            cluster=target.name,
            previous_cluster=source.name,
            relocated_at=now,
            sid="",
            absent_since=None,
            epoch=F("epoch") + 1,
            updated_at=now,
        ):
            raise RelocationRefusedError(
                f"The placement of LiveKit room {room_name} changed meanwhile."
            )
        return source, target

    @classmethod
    def _relocation_clusters(
        cls, placement: Placement, to: str | None
    ) -> tuple[LiveKitClusterConfig, LiveKitClusterConfig]:
        """Return the LiveKit cluster a placement leaves and the one it moves to.

        That is the candidate named `to`, or else the one the placement strategy
        picks among the candidates other than the cluster the placement leaves.
        """
        room_name = placement.room_name
        clusters = {cluster.name: cluster for cluster in get_livekit_clusters()}
        source = clusters.get(placement.cluster)
        if source is None:
            raise RelocationRefusedError(
                f"LiveKit room {room_name} is placed on LiveKit cluster "
                f"{placement.cluster}, which is not registered."
            )

        candidates = tuple(
            cluster for cluster in cls.candidates() if cluster.name != source.name
        )
        if to is None:
            if not candidates:
                raise RelocationRefusedError(
                    f"No LiveKit cluster other than {source.name} may receive "
                    f"LiveKit room {room_name}."
                )
            context = PlacementContext(room_name=room_name, room=placement.room)
            return source, get_placement_strategy().choose(candidates, context)

        if to == source.name:
            raise RelocationRefusedError(
                f"LiveKit room {room_name} is placed on LiveKit cluster {to} already."
            )
        for candidate in candidates:
            if candidate.name == to:
                return source, candidate
        if to not in clusters:
            raise RelocationRefusedError(f"No LiveKit cluster is named {to!r}.")
        raise RelocationRefusedError(
            f"LiveKit cluster {to} may not receive new placements."
        )

    @classmethod
    def close_stray_room(
        cls, cluster: LiveKitClusterConfig, room_name: str, *, actor: Any
    ) -> bool:
        """Close a LiveKit room live on a LiveKit cluster it is not placed on.

        Its participants are told of a relocation, which makes them ask Django
        again where to connect, and the LiveKit room is deleted from that
        cluster. Its placement, if any, is left as it is.

        `actor` is who closes the LiveKit room, as recorded in the audit log: a
        user, such as one acting through the admin, or None for the system.

        Return whether the LiveKit room was closed. Failures are logged and
        audited, never raised.
        """
        return cls._close_livekit_room(cluster, room_name, str(uuid4()), actor=actor)

    @staticmethod
    def _close_livekit_room(
        cluster: LiveKitClusterConfig,
        room_name: str,
        relocation_id: str,
        *,
        actor: Any,
    ) -> bool:
        """Announce a relocation in a LiveKit room, then delete it, on a cluster.

        The relocation id is merged into the LiveKit room's metadata, which
        reaches participants ahead of the disconnection its deletion causes, and
        which participants joining it read as they join: they ask Django again
        where to connect, once per relocation id. A LiveKit room that is not
        live there is left alone. When the cluster fails to announce the
        relocation, the LiveKit room is not deleted, as that would send its
        participants away as if the meeting were over.

        Return whether the LiveKit room was closed. Failures are logged and
        audited, never raised.
        """
        # pylint: disable-next=import-outside-toplevel,cyclic-import
        from core.services import room_management  # noqa: PLC0415

        error = None
        try:
            room_management.RoomManagement.update_metadata(
                room_name, {"relocation": {"id": relocation_id}}, cluster=cluster
            )
            room_management.RoomManagement.delete_room(room_name, cluster=cluster)
        except room_management.RoomNotFoundException:
            logger.info(
                "LiveKit room %s is not live on LiveKit cluster %s: nothing to close",
                room_name,
                cluster.name,
            )
            return False
        except Exception as failure:  # pylint: disable=broad-exception-caught
            logger.exception(
                "LiveKit cluster %s failed to close LiveKit room %s",
                cluster.name,
                room_name,
            )
            error = failure
        else:
            logger.info(
                "Closed LiveKit room %s on LiveKit cluster %s", room_name, cluster.name
            )

        _audit(
            auditing.LIVEKIT_ROOM_CLOSE,
            actor,
            target=auditing.livekit_room_target(room_name),
            target_service="livekit",
            outcome=audit.Outcome.SUCCESS if error is None else audit.Outcome.FAILURE,
            reason=None if error is None else audit.Reason.INTERNAL_ERROR,
            error_type=None if error is None else audit.exception_type(error),
            cluster=cluster.name,
            relocation_id=relocation_id,
        )
        return error is None
