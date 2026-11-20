"""Placements of LiveKit rooms on the LiveKit clusters.

A placement records the LiveKit cluster a LiveKit room lives on, from the first
credentials handed out for it, or the first time a cluster tells the LiveKit
room started there, until the LiveKit room finishes. Only rooms whose lifecycle
Django follows are placed: unregistered rooms never are, and live on the
default cluster.
"""

import contextlib
from dataclasses import dataclass
from enum import StrEnum
from logging import getLogger
from typing import Any
from uuid import uuid4

from django.db.models import F
from django.utils import timezone

from livekit.protocol.models import Room as LiveKitRoom

from core import audit, auditing
from core.models import Placement, Room

from .clusters import LiveKitClusterConfig, get_livekit_clusters
from .exceptions import (
    LiveKitRoomCloseError,
    LiveKitRoomCreationError,
    LiveKitRoomEndedError,
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


class LiveKitRoomFailure(StrEnum):
    """How a LiveKit room failed a frontend: deleted, or missing otherwise."""

    MISSING = "missing"
    DELETED = "deleted"


class StartSource(StrEnum):
    """What told that a LiveKit room started: its room_started webhook, or a
    reconciliation listing it live."""

    ROOM_STARTED = "room_started"
    RECONCILIATION = "reconciliation"


class RecordedStart(StrEnum):
    """What recording a LiveKit room started on a LiveKit cluster did.

    - ADOPTED: it had no placement, and was placed on that cluster.
    - RECORDED: its SID was recorded on its placement there.
    - UNCHANGED: nothing was written, as its placement there records a SID
      already, or as it was told without SID, or left without placement while
      no cluster may receive new placements.
    - CLOSED: it was closed there, as its room is placed elsewhere or as that
      cluster may not receive new placements.
    - LEFT_ALONE: it was left alone, as its room is placed on a cluster that
      is not registered, or as it was no longer live where it was to be closed.
    """

    ADOPTED = "adopted"
    RECORDED = "recorded"
    UNCHANGED = "unchanged"
    CLOSED = "closed"
    LEFT_ALONE = "left_alone"

    @property
    def is_current(self) -> bool:
        """Return whether the LiveKit room started is that of its room: the one
        its room is placed on, or one left without placement."""
        return self in (
            RecordedStart.ADOPTED,
            RecordedStart.RECORDED,
            RecordedStart.UNCHANGED,
        )

    @property
    def is_new(self) -> bool:
        """Return whether the start of the LiveKit room was unknown until then."""
        return self in (RecordedStart.ADOPTED, RecordedStart.RECORDED)


@dataclass(frozen=True, kw_only=True)
class JoinIntent:
    """How a frontend asks where to connect to a LiveKit room."""

    ensure_room: bool = True
    failed_room_sid: str = ""
    failure: LiveKitRoomFailure | None = None


ENSURE_ROOM = JoinIntent()


@dataclass(frozen=True, kw_only=True)
class LiveKitRoomLocation:
    """Where to connect to a LiveKit room: its LiveKit cluster, and the SID of
    the LiveKit room live there, as its placement records it."""

    cluster: LiveKitClusterConfig
    sid: str


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
    def place(cls, room: Room, intent: JoinIntent = ENSURE_ROOM) -> LiveKitRoomLocation:
        """Make a LiveKit room ready to be joined and return where it lives.

        The LiveKit room is created on the cluster of its placement, which then
        records the SID the cluster returns. A LiveKit room without placement,
        or placed on a cluster no longer registered, is placed first, on the
        cluster the placement strategy picks. A placement created by this call
        is deleted when its cluster fails to create the LiveKit room, for the
        next call to place it again, as long as it still has the epoch read and
        no SID: no one was handed out credentials for it then. A placement that
        changes while its cluster creates the LiveKit room is read again, and
        the LiveKit room created where it then says, a bounded number of times.

        Without ensure_room, or when a failure is reported, the placement
        decides first, each time it is read: a LiveKit room known to be live on
        a registered cluster, with a SID other than the failed one, is returned
        as it is, and one reported deleted ended its meeting when it has no
        placement, or one still recording its SID.

        Raises:
            LiveKitRoomEndedError: the LiveKit room reported deleted ended its
                meeting.
            LiveKitRoomUnavailableError: the LiveKit room cannot be placed or
                created, or its placement kept changing.
        """
        # pylint: disable-next=import-outside-toplevel,cyclic-import
        from core.services import room_management  # noqa: PLC0415

        room_name = str(room.id)
        if intent.failure is not None:
            logger.info(
                "LiveKit room %s reported %s with SID %r",
                room_name,
                intent.failure,
                intent.failed_room_sid,
            )

        for _attempt in range(PLACEMENT_UPDATE_ATTEMPTS):
            location = cls._known_location(room_name, intent)
            if location is not None:
                return location

            placement, cluster, created = cls._get_or_create_placement(room)
            try:
                livekit_room = room_management.RoomManagement.create_room(
                    room_name, cluster=cluster
                )
            except LiveKitRoomCreationError:
                if created:
                    deleted, _ = Placement.objects.filter(
                        pk=placement.pk, epoch=placement.epoch, sid=""
                    ).delete()
                    if deleted:
                        logger.info(
                            "Deleted the placement of LiveKit room %s on LiveKit "
                            "cluster %s, which failed to create it",
                            room_name,
                            cluster.name,
                        )
                raise

            sid = livekit_room.sid
            if Placement.objects.filter(
                pk=placement.pk, epoch=placement.epoch, sid__in=(placement.sid, sid)
            ).update(sid=sid, absent_since=None, updated_at=timezone.now()):
                return LiveKitRoomLocation(cluster=cluster, sid=sid)

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

    @staticmethod
    def _known_location(
        room_name: str, intent: JoinIntent
    ) -> LiveKitRoomLocation | None:
        """Return where a LiveKit room is known to be live, or None to ensure it."""
        if intent.ensure_room and intent.failure is None:
            return None

        placement = Placement.objects.filter(room_name=room_name).first()
        if placement is None or placement.sid == intent.failed_room_sid:
            if intent.failure == LiveKitRoomFailure.DELETED:
                raise LiveKitRoomEndedError(
                    f"The meeting of LiveKit room {room_name} ended."
                )
            return None

        clusters = {cluster.name: cluster for cluster in get_livekit_clusters()}
        cluster = clusters.get(placement.cluster)
        if placement.sid and placement.absent_since is None and cluster is not None:
            return LiveKitRoomLocation(cluster=cluster, sid=placement.sid)
        return None

    @classmethod
    def _get_or_create_placement(
        cls, room: Room
    ) -> tuple[Placement, LiveKitClusterConfig, bool]:
        """Return the placement of a LiveKit room, placing if needed.

        For new placements, concurrent creations are dealt with by the unique
        constraint on room_name: each request reads the placement back after
        inserting it, which is way less intense than relying on PostgreSQL
        advisory locks. On conflict, the LiveKit room is placed again, a bounded
        number of times, and its placement deleted when it is on a cluster no
        longer registered.
        """
        room_name = str(room.id)
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

    @classmethod
    def record_started(
        cls,
        cluster: LiveKitClusterConfig,
        livekit_room: LiveKitRoom,
        room: Room | None = None,
        *,
        source: StartSource = StartSource.ROOM_STARTED,
    ) -> RecordedStart:
        """Record a LiveKit room a LiveKit cluster tells started on it.

        Return what was done with it, named after the room given, if any:

        - Without placement, it is placed on its cluster when that cluster may
          receive new placements, with its SID: it is adopted. It is left
          without placement when no cluster may, and closed otherwise.
        - Placed on a cluster this process does not know, it is left alone, and
          so is its placement: processes may disagree on the clusters while
          their registry changes.
        - Placed on another cluster, it is closed, unless the placement read
          again right before closing it says otherwise.
        - Placed on its cluster, its SID is recorded when the placement has
          none. A SID recorded is kept: joins create the LiveKit rooms of a
          cluster, and record their SID themselves.

        An adoption is audited as made by the system, with the source given:
        what told that the LiveKit room started. Only a placement this call
        inserted and reads back is an adoption: one another request inserted
        meanwhile is decided upon as any other. It is audited first, as what
        is then done with the LiveKit room may raise.

        A LiveKit room closed is deleted from its cluster, which disconnects its
        participants with the ROOM_DELETED reason. A LiveKit room told without
        SID is taken for the one its room is placed on, and nothing recorded.

        Raises:
            LiveKitRoomCloseError: the cluster failed to close the LiveKit room.
            PlacementChangedError: the placement kept changing meanwhile.
        """
        if not livekit_room.sid:
            return RecordedStart.UNCHANGED

        placements = Placement.objects.filter(room_name=livekit_room.name)
        adoption = None
        for _attempt in range(PLACEMENT_CREATION_ATTEMPTS):
            placement = placements.first()
            if placement is None:
                adoption = Placement(
                    room_name=livekit_room.name,
                    room=room,
                    cluster=cluster.name,
                    sid=livekit_room.sid,
                )
                started = cls._place_started(cluster, adoption)
            else:
                adopted = adoption is not None and placement.pk == adoption.pk
                adoption = None
                if adopted:
                    _audit(
                        auditing.LIVEKIT_PLACEMENT_ADOPT,
                        None,
                        target=auditing.livekit_room_target(livekit_room.name),
                        cluster=cluster.name,
                        sid=livekit_room.sid,
                        source=source,
                    )
                started = cls._record_start(cluster, livekit_room, placement)
                if adopted and started == RecordedStart.UNCHANGED:
                    started = RecordedStart.ADOPTED
            if started is not None:
                return started

        logger.warning(
            "Placement of LiveKit room %s kept changing while its LiveKit room "
            "started on LiveKit cluster %s was recorded",
            livekit_room.name,
            cluster.name,
        )
        raise PlacementChangedError(
            f"The placement of LiveKit room {livekit_room.name} kept changing."
        )

    @classmethod
    def _record_start(
        cls,
        cluster: LiveKitClusterConfig,
        livekit_room: LiveKitRoom,
        placement: Placement,
    ) -> RecordedStart | None:
        """Record a LiveKit room started on a cluster, its placement as read.

        A SID recorded is kept whatever SID started, as a webhook may be late.
        Started on another cluster, the LiveKit room is closed only while its
        placement, read again right before, is still on another registered
        cluster.

        Return what was done, or None when the placement changed since it was
        read, and is to be read again.
        """
        room_name = livekit_room.name
        registered = {known.name for known in get_livekit_clusters()}
        if placement.cluster not in registered:
            logger.warning(
                "LiveKit room %s started on LiveKit cluster %s, but is placed on "
                "LiveKit cluster %s, which is not registered: leaving both alone",
                room_name,
                cluster.name,
                placement.cluster,
            )
            return RecordedStart.LEFT_ALONE

        if placement.cluster != cluster.name:
            current = Placement.objects.filter(room_name=room_name).first()
            if (
                current is None
                or current.cluster == cluster.name
                or current.cluster not in registered
            ):
                return None
            logger.warning(
                "LiveKit room %s started on LiveKit cluster %s, but is placed on "
                "LiveKit cluster %s: closing it",
                room_name,
                cluster.name,
                current.cluster,
            )
            closed = cls.close_stray_room(cluster, room_name, actor=None)
            return RecordedStart.CLOSED if closed else RecordedStart.LEFT_ALONE

        if placement.sid:
            if placement.sid != livekit_room.sid:
                logger.info(
                    "LiveKit room %s started on LiveKit cluster %s with SID %s, "
                    "while placed there with SID %s: keeping its placement",
                    room_name,
                    cluster.name,
                    livekit_room.sid,
                    placement.sid,
                )
            return RecordedStart.UNCHANGED

        if Placement.objects.filter(
            pk=placement.pk,
            epoch=placement.epoch,
            cluster=cluster.name,
            sid="",
        ).update(
            sid=livekit_room.sid,
            absent_since=None,
            updated_at=timezone.now(),
        ):
            logger.info(
                "Recorded LiveKit room %s started on LiveKit cluster %s with SID %s",
                room_name,
                cluster.name,
                livekit_room.sid,
            )
            return RecordedStart.RECORDED
        return None

    @classmethod
    def _place_started(
        cls, cluster: LiveKitClusterConfig, adoption: Placement
    ) -> RecordedStart | None:
        """Place a LiveKit room started on a cluster without placement.

        The adoption given, its placement on that cluster, is inserted when the
        cluster may receive new placements, and the placement is to be read
        again: return None. The LiveKit room is left without placement when no
        cluster may, and closed otherwise: return what was done.
        """
        candidates = cls.candidates()
        if any(candidate.name == cluster.name for candidate in candidates):
            logger.info(
                "LiveKit room %s started on LiveKit cluster %s with SID %s without "
                "placement: placing it there",
                adoption.room_name,
                cluster.name,
                adoption.sid,
            )
            Placement.objects.bulk_create([adoption], ignore_conflicts=True)
            return None

        if not candidates:
            logger.warning(
                "LiveKit room %s started on LiveKit cluster %s without placement, "
                "while no LiveKit cluster may receive new placements: leaving it "
                "alone",
                adoption.room_name,
                cluster.name,
            )
            return RecordedStart.UNCHANGED

        logger.warning(
            "LiveKit room %s started without placement on LiveKit cluster %s, "
            "which may not receive new placements: closing it",
            adoption.room_name,
            cluster.name,
        )
        closed = cls.close_stray_room(cluster, adoption.room_name, actor=None)
        return RecordedStart.CLOSED if closed else RecordedStart.LEFT_ALONE

    @classmethod
    def relocate(
        cls, room_name: str, to: str | None = None, *, actor: Any
    ) -> LiveKitClusterConfig:
        """Relocate a room to another LiveKit cluster and return that cluster.

        The placement of its LiveKit room moves to the candidate named `to`, or
        else to the one the placement strategy picks among the candidates other
        than its current cluster. The move bumps its epoch, records the cluster
        it left, and clears the SID and the absence, which were those of the
        LiveKit room on that cluster: the LiveKit room gets a SID once created
        on the new one. Credentials are then handed out for the new cluster,
        where the next join creates the LiveKit room. The LiveKit room is then
        deleted on the cluster it left, which disconnects its participants with
        the ROOM_DELETED reason: frontends that follow moves ask Django again
        where to connect, with the SID of the LiveKit room deleted. The
        relocation stands even when that cluster fails to delete it, which is
        logged and audited.

        `actor` is who relocates the room, as recorded in the audit log: a user,
        such as one acting through the admin, or None for the system. The
        relocation and the closing of the LiveKit room it left are audited with
        the same relocation id.
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
        with contextlib.suppress(LiveKitRoomCloseError):
            cls.close_stray_room(
                source, room_name, actor=actor, relocation_id=relocation_id
            )
        return target

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
        cls,
        cluster: LiveKitClusterConfig,
        room_name: str,
        *,
        actor: Any,
        relocation_id: str | None = None,
    ) -> bool:
        """Close a LiveKit room live on a LiveKit cluster it is not placed on.

        The LiveKit room is deleted from that cluster, which disconnects its
        participants with the ROOM_DELETED reason: frontends that follow moves
        ask Django again where to connect, with the SID of the LiveKit room
        deleted. Its placement, if any, is left as it is.

        `actor` is who closes the LiveKit room, as recorded in the audit log: a
        user, such as one acting through the admin, or None for the system. The
        closing is audited, with the relocation id given, if any, which
        correlates it with its relocation.

        Return whether the LiveKit room was closed: a LiveKit room that is not
        live on the cluster is left alone, which is not audited.

        Raises:
            LiveKitRoomCloseError: the cluster failed to delete the LiveKit
                room, which is logged and audited.
        """
        # pylint: disable-next=import-outside-toplevel,cyclic-import
        from core.services import room_management  # noqa: PLC0415

        error = None
        try:
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
        if error is not None:
            raise LiveKitRoomCloseError(
                f"LiveKit cluster {cluster.name} failed to close LiveKit room "
                f"{room_name}."
            ) from error
        return True
