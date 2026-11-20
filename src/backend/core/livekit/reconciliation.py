"""Reconciliation of the placements of LiveKit rooms with their LiveKit clusters.

Placements follow LiveKit rooms through the webhooks of their clusters, which
may be lost: a placement then outlives its LiveKit room, and a LiveKit room may
stay live on a cluster it is not placed on, or without placement. A
reconciliation lists the LiveKit rooms live on every registered cluster and
compares them with the placements, room by room:

- A placement on a cluster that is not registered, or that could not be
  listed, is left alone, with the LiveKit rooms of its room on other clusters.
- A LiveKit room live on another cluster than its placement's is closed. When
  its own LiveKit room is missing, the placement is then left to the next
  reconciliation: the participants of the one closed are coming to it.
- A placement whose LiveKit room is live on its cluster with another SID
  records the SID listed, and the start of its room is recorded. Live there
  with its SID, it is no longer absent.
- A placement whose LiveKit room is missing from its cluster is marked absent,
  then deleted once absent and unwritten for absence_grace(), and its room
  cleaned up as when its LiveKit room finishes. One relocated from a
  registered cluster that could not be listed is kept: its meeting may go on
  there.
- A LiveKit room live without placement is recorded as room_started would: the
  one with the most participants, then the oldest, is adopted on a cluster
  that may receive new placements, and the others are closed.
- The LiveKit rooms of a soft deleted room are closed.

Rooms are filtered as webhooks are, and LiveKit rooms live without placement
named after no room are left alone, counted.

Placements are read once the listing ended. Those written since it started are
left alone, and so is a room whose placement, there right before the listing,
is gone after it: the LiveKit room listed may be the one that finished
meanwhile. Any other LiveKit room that finishes during the listing is taken
for live, until the next reconciliation finds it missing. Each write applies
only to the placement as read, so nothing keeps two reconciliations apart. A
reconciliation never creates a LiveKit room.

A cluster keeps listing the LiveKit rooms of a node it lost, and fails to close
each after a timeout: no LiveKit room is closed on a cluster that failed
MAX_FAILED_CLOSES closes, nor anywhere once the reconciliation has lasted
CLOSE_BUDGET.
"""

import asyncio
import math
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from logging import getLogger
from typing import Any

from django.conf import settings
from django.db.models import QuerySet
from django.utils import timezone

import aiohttp
from asgiref.sync import async_to_sync
from livekit.api import TwirpError
from livekit.protocol.models import (  # pylint: disable=no-name-in-module
    Room as LiveKitRoom,
)

from core import audit, auditing
from core.models import Placement, Room
from core.services.livekit_events import ActionFailedError, LiveKitEventsService
from core.services.room_management import RoomManagement

from .clusters import LiveKitClusterConfig, get_livekit_clusters
from .exceptions import LiveKitRoomCloseError, PlacementChangedError
from .placements import PlacementService, RecordedStart, StartSource

logger = getLogger(__name__)

MAX_FAILED_CLOSES = 3
CLOSE_BUDGET = timedelta(seconds=60)
ABSENCE_GRACE_FLOOR = 15 * 60
ABSENCE_GRACE_MARGIN = 5 * 60

UNREACHABLE_ERRORS = (TwirpError, TimeoutError, aiohttp.ClientError)


def absence_grace() -> int:
    """Return for how long, in seconds, a placement stays absent before it is
    deleted: ABSENCE_GRACE_MARGIN longer than frontends keep reconnecting to
    its LiveKit room before they ask where to connect again, and
    ABSENCE_GRACE_FLOOR at least."""
    return max(
        ABSENCE_GRACE_FLOOR,
        settings.LIVEKIT_RECONNECT_GIVE_UP_AFTER_MS // 1000 + ABSENCE_GRACE_MARGIN,
    )


class Tally(StrEnum):
    """What a reconciliation counts, as its summary names it."""

    MARKED_ABSENT = "marked absent"
    LIVE_AGAIN = "live again"
    DELETED = "deleted"
    REPAIRED = "repaired"
    ADOPTED = "adopted"
    CLOSED = "closed"
    FAILED_CLOSES = "failed closes"
    UNREACHABLE_CLUSTERS = "unreachable clusters"
    UNREGISTERED_PLACEMENTS = "unregistered placements"
    FOREIGN_ROOMS = "foreign rooms"


@dataclass
class ReconciliationReport:
    """What a reconciliation did, or a dry run would do, counted by Tally."""

    counts: Counter = field(default_factory=Counter)

    def summary(self) -> str:
        """Sum the counts up in one line, every Tally in order."""
        counted = ", ".join(f"{self.counts[tally]} {tally}" for tally in Tally)
        return f"LiveKit placements reconciled: {counted}."


@dataclass(frozen=True)
class Snapshot:
    """The LiveKit rooms live on the LiveKit clusters that could be listed, by
    room name then cluster name, in registry order, as listed from taken_at
    on, the names of the clusters that could not be listed, and those of the
    rooms placed right before."""

    taken_at: datetime
    live: dict[str, dict[str, LiveKitRoom]]
    unreachable: frozenset[str]
    placed: frozenset[str]


@async_to_sync
async def _list_clusters(
    clusters: Sequence[LiveKitClusterConfig],
) -> list[list[LiveKitRoom] | BaseException]:
    """List the LiveKit rooms live on each of these clusters, all at once, and
    return, in the same order, what each listing returned or raised."""
    return await asyncio.gather(
        *(RoomManagement.list_rooms(cluster) for cluster in clusters),
        return_exceptions=True,
    )


def _take_snapshot(
    clusters: Sequence[LiveKitClusterConfig], report: ReconciliationReport
) -> Snapshot:
    """List the LiveKit rooms live on these clusters, the names of the rooms
    placed being read right before.

    A cluster that cannot be listed is recorded as unreachable, which is logged
    and counted. Any other error is raised once every listing ended.
    """
    placed = frozenset(Placement.objects.values_list("room_name", flat=True))
    taken_at = timezone.now()
    live, unreachable = {}, set()
    for cluster, listed in zip(clusters, _list_clusters(clusters), strict=True):
        if isinstance(listed, UNREACHABLE_ERRORS):
            logger.warning(
                "Could not list the LiveKit rooms live on LiveKit cluster %s: "
                "leaving it alone (%s)",
                cluster.name,
                _describe(listed),
            )
            report.counts[Tally.UNREACHABLE_CLUSTERS] += 1
            unreachable.add(cluster.name)
        elif isinstance(listed, BaseException):
            raise listed
        else:
            for livekit_room in listed:
                live.setdefault(livekit_room.name, {})[cluster.name] = livekit_room
    return Snapshot(
        taken_at=taken_at, live=live, unreachable=frozenset(unreachable), placed=placed
    )


def _describe(error: BaseException) -> str:
    """Describe an error by its type, and its message when it has one."""
    message = str(error)
    return f"{type(error).__name__}: {message}" if message else type(error).__name__


def _biggest_first(
    livekit_rooms: dict[str, LiveKitRoom],
) -> list[tuple[str, LiveKitRoom]]:
    """Order the LiveKit rooms of a room, by cluster name, the one with the
    most participants first, then the oldest, then in registry order. A
    LiveKit room created at an unknown time is taken for the newest."""
    return sorted(
        livekit_rooms.items(),
        key=lambda item: (
            -item[1].num_participants,
            item[1].creation_time_ms if item[1].creation_time_ms > 0 else math.inf,
        ),
    )


class _CloseBudget:
    """Whether a reconciliation started at started_at may still close LiveKit
    rooms, the closes its clusters fail being counted in its report."""

    def __init__(self, started_at: datetime, report: ReconciliationReport):
        self.started_at = started_at
        self.report = report
        self.failures = Counter()
        self.spent = False

    def allows(self, cluster_name: str) -> bool:
        """Return whether a LiveKit room may still be closed on a cluster."""
        if self.failures[cluster_name] >= MAX_FAILED_CLOSES:
            return False
        if not self.spent and timezone.now() - self.started_at >= CLOSE_BUDGET:
            self.spent = True
            logger.warning(
                "The reconciliation has lasted %d seconds: closing no more LiveKit "
                "rooms until the next reconciliation",
                CLOSE_BUDGET.total_seconds(),
            )
        return not self.spent

    def failed(self, cluster_name: str) -> None:
        """Count a close a cluster failed."""
        self.failures[cluster_name] += 1
        self.report.counts[Tally.FAILED_CLOSES] += 1
        if self.failures[cluster_name] == MAX_FAILED_CLOSES:
            logger.warning(
                "LiveKit cluster %s failed to close %d LiveKit rooms: closing no "
                "other there until the next reconciliation",
                cluster_name,
                MAX_FAILED_CLOSES,
            )


class _PlacementReconciliation:
    """The reconciliation of the placements with a snapshot of the LiveKit
    rooms live on the LiveKit clusters, counted in a report."""

    def __init__(
        self, snapshot: Snapshot, report: ReconciliationReport, *, dry_run: bool
    ):
        self.snapshot = snapshot
        self.report = report
        self.dry_run = dry_run
        self.budget = _CloseBudget(snapshot.taken_at, report)
        self.clusters = {cluster.name: cluster for cluster in get_livekit_clusters()}
        self.events = LiveKitEventsService()
        self.unregistered = set()

    def run(self) -> None:
        """Reconcile each room, in the order of their names, with its placement
        and its live LiveKit rooms."""
        placements, fresh = self._read_placements()
        rooms = self.events.get_followed_rooms(
            (set(placements) | set(self.snapshot.live)) - fresh
        )
        for room_name in sorted(rooms):
            livekit_rooms = self.snapshot.live.get(room_name, {})
            placement = placements.get(room_name)
            if placement is not None:
                self._reconcile_placed(placement, rooms[room_name], livekit_rooms)
            elif room_name in self.snapshot.placed:
                self._changed_meanwhile(room_name)
            else:
                self._reconcile_unplaced(room_name, rooms[room_name], livekit_rooms)
        self._warn_left_alone()

    def _read_placements(self) -> tuple[dict[str, Placement], set[str]]:
        """Return the placements written before the listing started, by room
        name, and the room names of those written since."""
        placements, fresh = {}, set()
        for placement in Placement.objects.all():
            if placement.updated_at >= self.snapshot.taken_at:
                fresh.add(placement.room_name)
            else:
                placements[placement.room_name] = placement
        return placements, fresh

    def _warn_left_alone(self) -> None:
        """Warn, once for all, of the placements on clusters that are not
        registered and of the LiveKit rooms named after no room."""
        if self.unregistered:
            logger.warning(
                "%d placement(s) are on LiveKit cluster(s) %s, which are not "
                "registered: leaving them alone, for their next join to place "
                "them again",
                self.report.counts[Tally.UNREGISTERED_PLACEMENTS],
                ", ".join(sorted(self.unregistered)),
            )
        if self.report.counts[Tally.FOREIGN_ROOMS]:
            logger.warning(
                "%d LiveKit room(s) live without placement are named after no "
                "room: leaving them alone",
                self.report.counts[Tally.FOREIGN_ROOMS],
            )

    def _reconcile_placed(
        self,
        placement: Placement,
        room: Room | None,
        livekit_rooms: dict[str, LiveKitRoom],
    ) -> None:
        """Reconcile a placement with the LiveKit rooms of its room, by
        cluster name."""
        cluster_name = placement.cluster
        if cluster_name not in self.clusters:
            self.report.counts[Tally.UNREGISTERED_PLACEMENTS] += 1
            self.unregistered.add(cluster_name)
            return
        if cluster_name in self.snapshot.unreachable:
            return

        is_deleted = room is not None and room.is_deleted
        if is_deleted:
            closed = self._close_deleted_room(room, livekit_rooms)
        else:
            closed = self._close_strays(placement, livekit_rooms)
            if closed is None:
                return

        livekit_room = livekit_rooms.get(cluster_name)
        if livekit_room is None:
            if not closed:
                self._reconcile_missing(placement)
        elif not is_deleted:
            self._reconcile_live(placement, room, livekit_room)

    def _close_strays(
        self, placement: Placement, livekit_rooms: dict[str, LiveKitRoom]
    ) -> bool | None:
        """Close the LiveKit rooms of a placed room live on other clusters
        than its placement's, the placement being read again before each close.

        Return whether one was closed, or None when the placement changed,
        which leaves the room to the next reconciliation.
        """
        room_name = placement.room_name
        unchanged = Placement.objects.filter(
            pk=placement.pk, epoch=placement.epoch, cluster=placement.cluster
        )
        closed = False
        for cluster_name in livekit_rooms:
            if cluster_name == placement.cluster or not self.budget.allows(
                cluster_name
            ):
                continue
            if not unchanged.exists():
                self._changed_meanwhile(room_name)
                return None
            if self.dry_run:
                self._plan(
                    Tally.CLOSED,
                    "Would close LiveKit room %s on LiveKit cluster %s, placed on "
                    "LiveKit cluster %s",
                    room_name,
                    cluster_name,
                    placement.cluster,
                )
                closed = True
                continue
            logger.info(
                "LiveKit room %s is live on LiveKit cluster %s, but placed on LiveKit "
                "cluster %s: closing it",
                room_name,
                cluster_name,
                placement.cluster,
            )
            try:
                if PlacementService.close_stray_room(
                    self.clusters[cluster_name], room_name, actor=None
                ):
                    self.report.counts[Tally.CLOSED] += 1
                    closed = True
            except LiveKitRoomCloseError:
                self.budget.failed(cluster_name)
        return closed

    def _close_deleted_room(
        self, room: Room, livekit_rooms: dict[str, LiveKitRoom]
    ) -> bool:
        """Close the LiveKit rooms of a soft deleted room, by cluster name, and
        return whether one was closed."""
        closed = False
        for cluster_name in livekit_rooms:
            if not self.budget.allows(cluster_name):
                continue
            if self.dry_run:
                self._plan(
                    Tally.CLOSED,
                    "Would close LiveKit room %s on LiveKit cluster %s, its room "
                    "being deleted",
                    room.id,
                    cluster_name,
                )
                closed = True
                continue
            try:
                if self.events.close_deleted_room(
                    room.id, cluster=self.clusters[cluster_name]
                ):
                    self.report.counts[Tally.CLOSED] += 1
                    closed = True
            except ActionFailedError:
                self.budget.failed(cluster_name)
        return closed

    def _reconcile_live(
        self, placement: Placement, room: Room | None, livekit_room: LiveKitRoom
    ) -> None:
        """Reconcile a placement whose LiveKit room is live on its cluster."""
        if livekit_room.sid != placement.sid:
            self._repair(placement, room, livekit_room)
        elif placement.absent_since is not None:
            self._clear_absence(placement)

    def _repair(
        self, placement: Placement, room: Room | None, livekit_room: LiveKitRoom
    ) -> None:
        """Record on a placement the SID of its LiveKit room as listed live on
        its cluster, which it is no longer absent from, then the start of its
        room.

        The listing wins where room_started keeps a SID recorded: it was taken
        after the placement was last written.
        """
        room_name, cluster_name = placement.room_name, placement.cluster
        if self.dry_run:
            self._plan(
                Tally.REPAIRED,
                "Would repair the SID of the placement of LiveKit room %s on "
                "LiveKit cluster %s: %r -> %r",
                room_name,
                cluster_name,
                placement.sid,
                livekit_room.sid,
            )
            return
        if not self._as_read(placement).update(
            sid=livekit_room.sid,
            absent_since=None,
            updated_at=timezone.now(),
        ):
            self._changed_meanwhile(room_name)
            return

        logger.info(
            "Repaired the SID of the placement of LiveKit room %s on LiveKit "
            "cluster %s: %r -> %r",
            room_name,
            cluster_name,
            placement.sid,
            livekit_room.sid,
        )
        _audit(
            auditing.LIVEKIT_PLACEMENT_REPAIR,
            room_name,
            cluster=cluster_name,
            sid={"from": placement.sid or None, "to": livekit_room.sid},
        )
        self.report.counts[Tally.REPAIRED] += 1
        self._record_start(room)

    def _clear_absence(self, placement: Placement) -> None:
        """Clear the absence of a placement whose LiveKit room is live again on
        its cluster, with its SID."""
        room_name, cluster_name = placement.room_name, placement.cluster
        if self.dry_run:
            self._plan(
                Tally.LIVE_AGAIN,
                "Would mark LiveKit room %s as live again on LiveKit cluster %s, "
                "where it is placed",
                room_name,
                cluster_name,
            )
            return
        if not self._as_read(placement).update(
            absent_since=None, updated_at=timezone.now()
        ):
            self._changed_meanwhile(room_name)
            return

        logger.info(
            "LiveKit room %s is live again on LiveKit cluster %s, where it is placed",
            room_name,
            cluster_name,
        )
        self.report.counts[Tally.LIVE_AGAIN] += 1

    def _reconcile_missing(self, placement: Placement) -> None:
        """Mark absent a placement whose LiveKit room is missing from its
        cluster, or delete it once absent and unwritten for absence_grace().

        One relocated from a registered cluster that could not be listed is
        kept, which is logged: its meeting may go on there, the relocation
        having failed to close its LiveKit room.
        """
        if placement.absent_since is None:
            self._mark_absent(placement)
            return
        deadline = self.snapshot.taken_at - timedelta(seconds=absence_grace())
        if placement.absent_since > deadline or placement.updated_at > deadline:
            return
        if placement.previous_cluster in self.snapshot.unreachable:
            logger.info(
                "Keeping the placement of LiveKit room %s on LiveKit cluster %s, "
                "missing from it since %s: LiveKit cluster %s, which it was "
                "relocated from, could not be listed",
                placement.room_name,
                placement.cluster,
                placement.absent_since.isoformat(),
                placement.previous_cluster,
            )
            return
        self._delete_absent(placement)

    def _mark_absent(self, placement: Placement) -> None:
        """Mark a placement as absent from its cluster since the listing."""
        room_name, cluster_name = placement.room_name, placement.cluster
        if self.dry_run:
            self._plan(
                Tally.MARKED_ABSENT,
                "Would mark LiveKit room %s as absent from LiveKit cluster %s, "
                "where it is placed",
                room_name,
                cluster_name,
            )
            return
        if not self._as_read(placement).update(
            absent_since=self.snapshot.taken_at, updated_at=timezone.now()
        ):
            self._changed_meanwhile(room_name)
            return

        logger.info(
            "LiveKit room %s is missing from LiveKit cluster %s, where it is "
            "placed: marked it absent",
            room_name,
            cluster_name,
        )
        self.report.counts[Tally.MARKED_ABSENT] += 1

    def _delete_absent(self, placement: Placement) -> None:
        """Delete a placement absent from its cluster for long enough, then clean
        up its room as when its LiveKit room finishes. A room that cannot be
        cleaned up is logged, the other rooms being reconciled all the same."""
        room_name, cluster_name = placement.room_name, placement.cluster
        absent_since = placement.absent_since.isoformat()
        if self.dry_run:
            self._plan(
                Tally.DELETED,
                "Would delete the placement of LiveKit room %s on LiveKit cluster "
                "%s, missing from it since %s",
                room_name,
                cluster_name,
                absent_since,
            )
            return
        deleted, _ = self._as_read(placement).delete()
        if not deleted:
            self._changed_meanwhile(room_name)
            return

        logger.info(
            "Deleted the placement of LiveKit room %s on LiveKit cluster %s, "
            "missing from it since %s",
            room_name,
            cluster_name,
            absent_since,
        )
        _audit(
            auditing.LIVEKIT_PLACEMENT_DELETE,
            room_name,
            cluster=cluster_name,
            sid=placement.sid or None,
            cause="absent",
        )
        self.report.counts[Tally.DELETED] += 1
        room_id = self.events.room_id(room_name)
        try:
            self.events.clean_up_room(room_id)
        except ActionFailedError:
            logger.exception(
                "Could not clean up room %s, whose placement was deleted", room_id
            )

    def _reconcile_unplaced(
        self, room_name: str, room: Room | None, livekit_rooms: dict[str, LiveKitRoom]
    ) -> None:
        """Reconcile the LiveKit rooms live for a room without placement, by
        cluster name."""
        if room is None:
            self.report.counts[Tally.FOREIGN_ROOMS] += 1
        elif room.is_deleted:
            self._close_deleted_room(room, livekit_rooms)
        else:
            self._record_started(room_name, room, livekit_rooms)

    def _record_started(
        self, room_name: str, room: Room, livekit_rooms: dict[str, LiveKitRoom]
    ) -> None:
        """Record the LiveKit rooms of a room without placement as started, by
        cluster name, the biggest first, as room_started does.

        The first one on a cluster that may receive new placements is adopted
        there, and the others are closed, unless no cluster may receive any.
        One that would be closed on a cluster no longer allowed to close any is
        left to the next reconciliation.
        """
        candidates = {cluster.name for cluster in PlacementService.candidates()}
        placed = False
        for cluster_name, livekit_room in _biggest_first(livekit_rooms):
            closing = bool(candidates) and (placed or cluster_name not in candidates)
            if closing and not self.budget.allows(cluster_name):
                continue
            if self.dry_run:
                if closing:
                    self._plan(
                        Tally.CLOSED,
                        "Would close LiveKit room %s on LiveKit cluster %s, live "
                        "there without placement",
                        room_name,
                        cluster_name,
                    )
                elif candidates:
                    self._plan(
                        Tally.ADOPTED,
                        "Would adopt LiveKit room %s, live without placement on "
                        "LiveKit cluster %s with SID %s",
                        room_name,
                        cluster_name,
                        livekit_room.sid,
                    )
                    placed = True
                continue
            try:
                started = PlacementService.record_started(
                    self.clusters[cluster_name],
                    livekit_room,
                    room,
                    source=StartSource.RECONCILIATION,
                )
            except LiveKitRoomCloseError:
                self.budget.failed(cluster_name)
                continue
            except PlacementChangedError:
                self._changed_meanwhile(room_name)
                return
            placed = placed or started.is_current
            if started == RecordedStart.ADOPTED:
                self.report.counts[Tally.ADOPTED] += 1
            elif started == RecordedStart.CLOSED:
                self.report.counts[Tally.CLOSED] += 1
            if started.is_new:
                self._record_start(room)

    def _record_start(self, room: Room | None) -> None:
        """Record the start of a room, as room_started does, unless its LiveKit
        room is named after no room. A start that cannot be recorded is logged,
        the other rooms being reconciled all the same."""
        if room is None:
            return
        try:
            self.events.record_room_start(room)
        except ActionFailedError:
            logger.exception("Could not record the start of room %s", room.id)

    def _plan(self, tally: Tally, message: str, *args: Any) -> None:
        """Log an action a dry run would take, counted as taken."""
        logger.info(message, *args)
        self.report.counts[tally] += 1

    @staticmethod
    def _as_read(placement: Placement) -> QuerySet:
        """Select a placement as long as it is still as read."""
        return Placement.objects.filter(
            pk=placement.pk,
            epoch=placement.epoch,
            cluster=placement.cluster,
            sid=placement.sid,
            absent_since=placement.absent_since,
        )

    @staticmethod
    def _changed_meanwhile(room_name: str) -> None:
        """Log that the placement of a room changed while it was reconciled,
        which leaves it to the next reconciliation."""
        logger.info(
            "Placement of LiveKit room %s changed while it was reconciled: leaving "
            "it to the next reconciliation",
            room_name,
        )


def _audit(action: audit.Action, room_name: str, **details: Any) -> None:
    """Audit an action of the system on the placement of a LiveKit room."""
    audit.log(
        action,
        actor=None,
        actor_type=audit.ActorType.SYSTEM,
        target=auditing.livekit_room_target(room_name),
        **details,
    )


def reconcile(*, dry_run: bool = False) -> ReconciliationReport:
    """Reconcile the placements of LiveKit rooms with the LiveKit rooms live on
    every registered LiveKit cluster, and return what was done, counted.

    In a dry run, nothing is written nor closed: the actions a reconciliation
    would take are logged and counted instead. A cluster that cannot be listed
    is left alone, and counted: any other error is raised.
    """
    report = ReconciliationReport()
    snapshot = _take_snapshot(get_livekit_clusters(), report)
    _PlacementReconciliation(snapshot, report, dry_run=dry_run).run()
    return report
