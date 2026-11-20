"""Unit tests for the reconciliation of placements with the LiveKit clusters."""

# pylint: disable=too-many-lines

import asyncio
import json
import logging
import uuid
from datetime import timedelta
from unittest import mock

from django.db.models import F
from django.test import override_settings
from django.utils import timezone

import aiohttp
import pytest
from freezegun import freeze_time
from livekit.api import TwirpError

from core.audit.testing import find_events
from core.factories import RoomFactory
from core.livekit import reconciliation
from core.livekit.exceptions import PlacementChangedError
from core.livekit.placements import PlacementService
from core.livekit.reconciliation import ReconciliationReport, Tally, reconcile
from core.models import Placement, Room
from core.services.livekit_events import LiveKitEventsService
from core.services.lobby import LobbyService
from core.services.presence import PresenceCache
from core.services.room_management import RoomManagement
from core.services.sip_management import SIPException, SIPManagement
from core.tests.utils import CREATED_LIVEKIT_ROOM_TIME_MS, livekit_cluster_entry

pytestmark = pytest.mark.django_db

GRACE = 15 * 60


@pytest.fixture(name="livekit", autouse=True)
def livekit_fixture(fake_livekit_clusters, settings):
    """Register the Paris, Lyon and Marseille LiveKit clusters, Paris being the
    default, and return what stands for their room services. Telephony and
    roomkit are disabled, as several clusters need."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry(name) for name in ("paris", "lyon", "marseille")]
    )
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    return fake_livekit_clusters


@pytest.fixture(name="room_cleanup")
def room_cleanup_fixture():
    """Mock the clearing of the presence and lobby caches of a room, and
    return both mocks."""
    with (
        mock.patch.object(PresenceCache, "clear_room") as clear_presence,
        mock.patch.object(LobbyService, "clear_room_cache") as clear_lobby,
    ):
        yield clear_presence, clear_lobby


def cleaned_up(room_cleanup):
    """Return the ids of the rooms cleaned up, in order, their presence and
    lobby caches having been cleared alike."""
    clear_presence, clear_lobby = room_cleanup
    assert clear_lobby.call_args_list == clear_presence.call_args_list
    return [room_id for (room_id,), _kwargs in clear_presence.call_args_list]


def ago(seconds):
    """Return the time it was this many seconds ago."""
    return timezone.now() - timedelta(seconds=seconds)


def rooms_in_order(count):
    """Create rooms, and return them in the order they are reconciled in: by
    name."""
    return sorted(RoomFactory.create_batch(count), key=lambda room: str(room.id))


def place(room, cluster="lyon", sid="RM_a", *, unwritten_for=None, **fields):
    """Place the LiveKit room of a room, given or named, on a cluster, and
    return its placement, written to that many seconds ago when told."""
    if isinstance(room, Room):
        fields["room"] = room
        room = str(room.id)
    placement = Placement.objects.create(
        room_name=room, cluster=cluster, sid=sid, **fields
    )
    if unwritten_for is not None:
        Placement.objects.filter(pk=placement.pk).update(updated_at=ago(unwritten_for))
        placement.refresh_from_db()
    return placement


def place_long_absent(room, cluster="lyon", **fields):
    """Place the LiveKit room of a room on a cluster, absent from it and
    unwritten for long enough to be deleted, and return its placement."""
    return place(
        room, cluster, absent_since=ago(2 * GRACE), unwritten_for=2 * GRACE, **fields
    )


def assert_unchanged(placement):
    """Assert that a placement is still as it was."""
    kept_placement = Placement.objects.get(pk=placement.pk)
    for name in (
        "room_name",
        "cluster",
        "sid",
        "epoch",
        "absent_since",
        "updated_at",
    ):
        assert getattr(kept_placement, name) == getattr(placement, name), name


def changed_meanwhile(room_name):
    """Return the message telling that a placement changed while reconciled."""
    return (
        f"Placement of LiveKit room {room_name} changed while it was reconciled: "
        "leaving it to the next reconciliation"
    )


def messages(caplog, level=logging.INFO):
    """Return the messages the reconciliation logged at this level or above."""
    return [
        record.getMessage()
        for record in caplog.records
        if record.name == "core.livekit.reconciliation" and record.levelno >= level
    ]


def changing_once_read(change):
    """Patch the reading of the rooms to reconcile, for a change to happen
    right after the placements are read, as by another request."""
    get_followed_rooms = LiveKitEventsService.get_followed_rooms

    def read(service, room_names):
        change()
        return get_followed_rooms(service, room_names)

    return mock.patch.object(
        LiveKitEventsService, "get_followed_rooms", autospec=True, side_effect=read
    )


def test_reconcile_summary():
    """The summary counts every action, in order."""
    report = ReconciliationReport()
    for count, tally in enumerate(Tally, start=1):
        report.counts[tally] = count

    assert report.summary() == (
        "LiveKit placements reconciled: 1 marked absent, 2 live again, 3 deleted, "
        "4 repaired, 5 adopted, 6 closed, 7 failed closes, 8 unreachable clusters, "
        "9 unregistered placements, 10 foreign rooms."
    )


def test_reconcile_lists_every_cluster_at_once():
    """The LiveKit rooms live on every registered cluster are listed at once,
    each listing starting before any ends."""
    started = []
    seen = {}

    async def list_rooms(cluster):
        started.append(cluster.name)
        for _turn in range(100):
            if len(started) == 3:
                break
            await asyncio.sleep(0)
        seen[cluster.name] = len(started)
        return []

    with mock.patch.object(RoomManagement, "list_rooms", side_effect=list_rooms):
        report = reconcile()

    assert sorted(started) == ["lyon", "marseille", "paris"]
    assert seen == {"paris": 3, "lyon": 3, "marseille": 3}
    assert report == ReconciliationReport()


def test_reconcile_placement_live_again(livekit, audit_events, caplog):
    """A placement absent from its cluster whose LiveKit room is live there
    again with its SID is no longer absent, which is counted, not audited."""
    placement = place(RoomFactory(), absent_since=ago(60))
    room_name = placement.room_name
    livekit.live("lyon", room_name, "RM_a")

    with caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"):
        report = reconcile()

    kept_placement = Placement.objects.get()
    assert kept_placement.absent_since is None
    assert kept_placement.sid == "RM_a"
    assert kept_placement.updated_at > placement.updated_at
    assert report.counts == {Tally.LIVE_AGAIN: 1}
    assert not audit_events
    assert messages(caplog) == [
        f"LiveKit room {room_name} is live again on LiveKit cluster lyon, where it "
        "is placed"
    ]


@pytest.mark.parametrize("sid", ("RM_old", ""))
@pytest.mark.parametrize("absent", (False, True))
def test_reconcile_placement_sid_repaired(sid, absent, livekit, audit_events, caplog):
    """A placement whose LiveKit room is live on its cluster with another SID,
    or which has no SID, gets the SID listed, and is no longer absent. This is
    audited as made by the system, and the start of its room is recorded: when
    it last started, and its SIP dispatch rule when telephony is enabled."""
    room = RoomFactory()
    placement = place(room, sid=sid, absent_since=ago(60) if absent else None)
    room_name = placement.room_name
    livekit.live("lyon", room_name, "RM_new")

    with (
        override_settings(ROOM_TELEPHONY_ENABLED=True),
        mock.patch.object(SIPManagement, "ensure_dispatch_rule") as ensure,
        caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"),
    ):
        report = reconcile()

    kept_placement = Placement.objects.get()
    assert kept_placement.sid == "RM_new"
    assert kept_placement.absent_since is None
    assert kept_placement.cluster == "lyon"
    assert kept_placement.epoch == 0
    assert kept_placement.updated_at > placement.updated_at
    assert report.counts == {Tally.REPAIRED: 1}
    assert messages(caplog) == [
        f"Repaired the SID of the placement of LiveKit room {room_name} on LiveKit "
        f"cluster lyon: {sid!r} -> 'RM_new'"
    ]
    [event] = audit_events
    assert event["event"]["action"] == "livekit.placement.repair"
    assert event["event"]["type"] == ["change"]
    assert event["lasuite"]["actor"] == {"type": "system"}
    assert event["entity"]["target"] == {"id": room_name, "sub_type": "livekit_room"}
    assert event["lasuite"]["details"] == {
        "cluster": "lyon",
        "sid": {"from": sid or None, "to": "RM_new"},
    }
    room.refresh_from_db()
    assert room.last_started_at is not None
    ensure.assert_called_once_with(room)
    assert not livekit.deleted


def test_reconcile_placement_sid_repaired_start_not_recorded(livekit, settings, caplog):
    """A room whose start cannot be recorded once its SID was repaired is
    logged, and the other rooms are reconciled all the same."""
    settings.ROOM_TELEPHONY_ENABLED = True
    first, second = rooms_in_order(2)
    for room in (first, second):
        place(room, sid="RM_old")
        livekit.live("lyon", str(room.id), "RM_new")

    with (
        mock.patch.object(
            SIPManagement, "ensure_dispatch_rule", side_effect=SIPException("down")
        ),
        caplog.at_level(logging.ERROR, logger="core.livekit.reconciliation"),
    ):
        report = reconcile()

    assert set(Placement.objects.values_list("sid", flat=True)) == {"RM_new"}
    assert report.counts == {Tally.REPAIRED: 2}
    assert messages(caplog, logging.ERROR) == [
        f"Could not record the start of room {first.id}",
        f"Could not record the start of room {second.id}",
    ]


def test_reconcile_placement_sid_repaired_named_after_no_room(livekit, audit_events):
    """The placement of a LiveKit room named after no room, such as one whose
    room was purged, gets its SID repaired all the same, with no start to
    record."""
    room_name = str(uuid.uuid4())
    place(room_name, sid="RM_old")
    livekit.live("lyon", room_name, "RM_new")

    report = reconcile()

    assert Placement.objects.get().sid == "RM_new"
    assert report.counts == {Tally.REPAIRED: 1}
    assert [event["event"]["action"] for event in audit_events] == [
        "livekit.placement.repair"
    ]


def test_reconcile_placement_marked_absent(livekit, audit_events, caplog):
    """A placement whose LiveKit room is missing from its cluster is marked
    absent since the listing started, which is counted, not audited."""
    placement = place(RoomFactory())
    room_name = placement.room_name
    listed_at = []
    livekit.on_list = lambda _cluster_name: listed_at.append(timezone.now())
    started_at = timezone.now()

    with caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"):
        report = reconcile()

    kept_placement = Placement.objects.get()
    assert started_at <= kept_placement.absent_since <= min(listed_at)
    assert kept_placement.sid == "RM_a"
    assert kept_placement.updated_at > max(listed_at)
    assert report.counts == {Tally.MARKED_ABSENT: 1}
    assert not audit_events
    assert messages(caplog) == [
        f"LiveKit room {room_name} is missing from LiveKit cluster lyon, where it is "
        "placed: marked it absent"
    ]


@pytest.mark.parametrize(
    "case",
    (
        (180_000, GRACE, GRACE, True),
        (180_000, GRACE - 1, GRACE, False),
        (180_000, GRACE, GRACE - 1, False),
        (1_500_000, 1_800 - 1, 1_800, False),
        (1_500_000, 1_800, 1_800, True),
        (1_500_000, 1_800, 1_800 - 1, False),
    ),
    ids=lambda case: "-".join(str(value) for value in case),
)
def test_reconcile_placement_absent_grace(case, livekit, settings, room_cleanup):
    """A placement absent from its cluster is deleted once absent for
    absence_grace(), and written to by no one for as long, both counted from
    the listing: at least 15 minutes, or LIVEKIT_RECONNECT_GIVE_UP_AFTER_MS
    plus 5 minutes. Each case gives that setting, for how long the placement
    was absent and unwritten, and whether it is deleted."""
    give_up_after_ms, absent_for, unwritten_for, deleted = case
    settings.LIVEKIT_RECONNECT_GIVE_UP_AFTER_MS = give_up_after_ms
    room = RoomFactory()
    with freeze_time("2026-11-20T10:00:00Z"):
        placement = place(
            room, absent_since=ago(absent_for), unwritten_for=unwritten_for
        )

        report = reconcile()

    assert reconciliation.absence_grace() == max(GRACE, give_up_after_ms // 1000 + 300)
    if deleted:
        assert not Placement.objects.exists()
        assert report.counts == {Tally.DELETED: 1}
        assert cleaned_up(room_cleanup) == [room.id]
    else:
        assert_unchanged(placement)
        assert report == ReconciliationReport()
        assert not cleaned_up(room_cleanup)
    assert not livekit.asked_deletions


@pytest.mark.parametrize("sid", ("RM_a", ""))
def test_reconcile_placement_deleted(sid, livekit, room_cleanup, audit_events, caplog):
    """A placement absent for long enough is deleted, which is audited as made
    by the system, with its SID when it records one, then its room is cleaned
    up as when its LiveKit room finishes."""
    room = RoomFactory()
    room_name = str(room.id)
    absent_since = place_long_absent(room, sid=sid).absent_since

    with caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"):
        report = reconcile()

    assert not Placement.objects.exists()
    assert report.counts == {Tally.DELETED: 1}
    assert cleaned_up(room_cleanup) == [room.id]
    assert messages(caplog) == [
        f"Deleted the placement of LiveKit room {room_name} on LiveKit cluster lyon, "
        f"missing from it since {absent_since.isoformat()}"
    ]
    [event] = audit_events
    assert event["event"]["action"] == "livekit.placement.delete"
    assert event["event"]["type"] == ["deletion"]
    assert event["lasuite"]["actor"] == {"type": "system"}
    assert event["entity"]["target"] == {"id": room_name, "sub_type": "livekit_room"}
    details = {"cluster": "lyon", "cause": "absent"}
    if sid:
        details["sid"] = sid
    assert event["lasuite"]["details"] == details
    assert not livekit.asked_deletions


def test_reconcile_placement_deleted_with_telephony(
    livekit, settings, room_cleanup, caplog
):
    """With telephony enabled, on the single cluster it takes, the room of a
    placement deleted for its absence has its SIP dispatch rule deleted too. A
    failure to delete it is logged once the caches are cleared, and the other
    rooms are reconciled all the same."""
    settings.LIVEKIT_CLUSTERS = None
    settings.ROOM_TELEPHONY_ENABLED = True
    first, second = rooms_in_order(2)
    for room in (first, second):
        place_long_absent(room, "default")

    with (
        mock.patch.object(
            SIPManagement, "delete_dispatch_rule", side_effect=SIPException("down")
        ) as delete_dispatch_rule,
        caplog.at_level(logging.ERROR, logger="core.livekit.reconciliation"),
    ):
        report = reconcile()

    assert not Placement.objects.exists()
    assert report.counts == {Tally.DELETED: 2}
    assert delete_dispatch_rule.call_args_list == [
        mock.call(first.id),
        mock.call(second.id),
    ]
    assert cleaned_up(room_cleanup) == [first.id, second.id]
    assert messages(caplog, logging.ERROR) == [
        f"Could not clean up room {first.id}, whose placement was deleted",
        f"Could not clean up room {second.id}, whose placement was deleted",
    ]
    assert not livekit.asked_deletions


def test_reconcile_placement_changed_meanwhile(livekit, room_cleanup, caplog):
    """A placement changed by another request once read is left to the next
    reconciliation: each write applies to the placement as read only."""
    absent, gone, repaired, again = (str(room.id) for room in rooms_in_order(4))
    place(absent)
    place_long_absent(gone)
    place(repaired, sid="RM_old")
    place(again, absent_since=ago(60))
    livekit.live("lyon", repaired, "RM_new")
    livekit.live("lyon", again, "RM_a")

    with (
        changing_once_read(lambda: Placement.objects.update(epoch=F("epoch") + 1)),
        caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"),
    ):
        report = reconcile()

    assert report == ReconciliationReport()
    assert Placement.objects.count() == 4
    assert set(Placement.objects.values_list("epoch", flat=True)) == {1}
    assert not cleaned_up(room_cleanup)
    assert messages(caplog) == [
        changed_meanwhile(room_name) for room_name in (absent, gone, repaired, again)
    ]


def test_reconcile_placement_written_since_listing(livekit, caplog):
    """A placement written since the listing started is left alone, and so are
    the LiveKit rooms of its room."""
    room = RoomFactory()
    room_name = str(room.id)
    placement = place(room, sid="RM_old")
    livekit.live("lyon", room_name, "RM_new")
    livekit.live("paris", room_name, "RM_b")

    def write_while_listing(_cluster_name):
        Placement.objects.filter(pk=placement.pk).update(updated_at=timezone.now())

    livekit.on_list = write_while_listing

    with caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"):
        report = reconcile()

    kept_placement = Placement.objects.get()
    assert kept_placement.sid == "RM_old"
    assert kept_placement.absent_since is None
    assert report == ReconciliationReport()
    assert not livekit.deleted
    assert not messages(caplog)


def test_reconcile_placement_gone_while_listing(livekit, room_cleanup, caplog):
    """Placements are read once every cluster was listed: a LiveKit room whose
    placement went away meanwhile, as its room_finished came, is left to the
    next reconciliation, the one listed being maybe the one that finished. The
    next one adopts it when it is still live."""
    room = RoomFactory()
    room_name = str(room.id)
    place(room)
    livekit.live("lyon", room_name, "RM_a")

    def finish_while_listing(cluster_name):
        if cluster_name == "marseille":
            Placement.objects.all().delete()

    livekit.on_list = finish_while_listing

    with caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"):
        report = reconcile()

    assert not Placement.objects.exists()
    assert report == ReconciliationReport()
    assert messages(caplog) == [changed_meanwhile(room_name)]
    assert not cleaned_up(room_cleanup)

    livekit.on_list = None
    report = reconcile()

    placement = Placement.objects.get()
    assert (placement.cluster, placement.sid) == ("lyon", "RM_a")
    assert report.counts == {Tally.ADOPTED: 1}


def test_reconcile_closes_strays(livekit, audit_events, caplog):
    """The LiveKit rooms of a placed room live on other clusters than its
    placement's are closed there, by the system, and counted. The placement is
    left as it is."""
    placement = place(RoomFactory())
    room_name = placement.room_name
    livekit.live("paris", room_name, "RM_p")
    livekit.live("lyon", room_name, "RM_a")
    livekit.live("marseille", room_name, "RM_m")

    with caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"):
        report = reconcile()

    assert livekit.deleted == [("paris", room_name), ("marseille", room_name)]
    assert list(livekit.rooms["lyon"]) == [room_name]
    assert_unchanged(placement)
    assert report.counts == {Tally.CLOSED: 2}
    assert messages(caplog) == [
        f"LiveKit room {room_name} is live on LiveKit cluster {cluster_name}, but "
        "placed on LiveKit cluster lyon: closing it"
        for cluster_name in ("paris", "marseille")
    ]
    events = find_events(audit_events, "livekit.room.close")
    assert [event["lasuite"]["details"] for event in events] == [
        {"cluster": "paris"},
        {"cluster": "marseille"},
    ]
    for event in events:
        assert event["lasuite"]["actor"] == {"type": "system"}


def test_reconcile_stray_closed_skips_absence(livekit):
    """A placement whose LiveKit room is missing from its cluster while one was
    closed elsewhere is left alone in that reconciliation: the participants of
    the LiveKit room closed are coming to it. It is marked absent by the next
    one, when its LiveKit room is still missing."""
    placement = place(RoomFactory())
    room_name = placement.room_name
    livekit.live("paris", room_name, "RM_p")

    report = reconcile()

    assert livekit.deleted == [("paris", room_name)]
    assert_unchanged(placement)
    assert report.counts == {Tally.CLOSED: 1}

    report = reconcile()

    assert Placement.objects.get().absent_since is not None
    assert report.counts == {Tally.MARKED_ABSENT: 1}


@pytest.mark.parametrize("deleted", (False, True))
def test_reconcile_not_closed_keeps_absence(deleted, livekit, room_cleanup):
    """A placement whose LiveKit room is missing from its cluster is reconciled
    as such when no LiveKit room of its room could be closed elsewhere, its
    room being soft deleted or not: one that failed to close, which is
    counted, or that is no longer live. It is marked absent, then deleted once
    absent for long enough."""
    room = RoomFactory()
    room_name = str(room.id)
    place(room)
    if deleted:
        room.soft_delete()
    livekit.live("paris", room_name, "RM_p")
    livekit.live("marseille", room_name, "RM_m")
    livekit.errors["paris", "delete_room"] = TwirpError("internal", "boom", status=500)
    livekit.errors["marseille", "delete_room"] = TwirpError(
        "not_found", "room not found", status=404
    )

    report = reconcile()

    assert Placement.objects.get().absent_since is not None
    assert report.counts == {Tally.MARKED_ABSENT: 1, Tally.FAILED_CLOSES: 1}

    Placement.objects.update(absent_since=ago(2 * GRACE), updated_at=ago(2 * GRACE))
    report = reconcile()

    assert not Placement.objects.exists()
    assert report.counts == {Tally.DELETED: 1, Tally.FAILED_CLOSES: 1}
    assert cleaned_up(room_cleanup) == [room.id]


def test_reconcile_stray_placement_changed_meanwhile(livekit, caplog):
    """A LiveKit room live elsewhere than its placement's cluster is closed
    only while the placement is still on that cluster, with the epoch read:
    otherwise it is left to the next reconciliation, and so is the
    placement."""
    placement = place(RoomFactory(), absent_since=ago(60))
    room_name = placement.room_name
    livekit.live("paris", room_name, "RM_p")
    livekit.live("lyon", room_name, "RM_a")

    def relocate():
        Placement.objects.update(
            cluster="paris", previous_cluster="lyon", sid="", epoch=F("epoch") + 1
        )

    with (
        changing_once_read(relocate),
        caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"),
    ):
        report = reconcile()

    assert not livekit.deleted
    assert report == ReconciliationReport()
    kept_placement = Placement.objects.get()
    assert kept_placement.cluster == "paris"
    assert kept_placement.absent_since is not None
    assert messages(caplog) == [changed_meanwhile(room_name)]


def test_reconcile_failed_closes_bounded(livekit, caplog):
    """Once a cluster failed to close MAX_FAILED_CLOSES LiveKit rooms, no
    other is closed there until the next reconciliation, which is warned once.
    LiveKit rooms are still closed on the other clusters, and each failure is
    counted. That holds for strays, the LiveKit rooms of soft deleted rooms and
    those of unplaced rooms alike, the adoption of an unplaced room still
    standing."""
    assert reconciliation.MAX_FAILED_CLOSES == 3
    rooms = rooms_in_order(7)
    room_names = [str(room.id) for room in rooms[:5]]
    deleted, unplaced = (str(room.id) for room in rooms[5:])
    for room_name in room_names:
        place(room_name)
        livekit.live("lyon", room_name, "RM_a")
        livekit.live("paris", room_name, "RM_p")
        livekit.live("marseille", room_name, "RM_m")
    rooms[5].soft_delete()
    livekit.live("paris", deleted, "RM_d")
    livekit.live("lyon", unplaced, "RM_l", num_participants=2)
    livekit.live("paris", unplaced, "RM_u", num_participants=1)
    livekit.errors["paris", "delete_room"] = TimeoutError()

    with caplog.at_level(logging.WARNING, logger="core.livekit.reconciliation"):
        report = reconcile()

    assert [
        room_name
        for cluster_name, room_name in livekit.asked_deletions
        if cluster_name == "paris"
    ] == room_names[:3]
    assert livekit.deleted == [("marseille", room_name) for room_name in room_names]
    assert Placement.objects.get(room_name=unplaced).cluster == "lyon"
    assert report.counts == {
        Tally.CLOSED: 5,
        Tally.FAILED_CLOSES: 3,
        Tally.ADOPTED: 1,
    }
    assert messages(caplog, logging.WARNING) == [
        "LiveKit cluster paris failed to close 3 LiveKit rooms: closing no other "
        "there until the next reconciliation"
    ]

    del livekit.errors["paris", "delete_room"]
    report = reconcile()

    assert livekit.deleted[5:] == [
        ("paris", room_name) for room_name in (*room_names, deleted, unplaced)
    ]
    assert report.counts == {Tally.CLOSED: 7}


def test_reconcile_closes_nothing_once_out_of_time(livekit, caplog):
    """Once the reconciliation has lasted CLOSE_BUDGET, counted from its
    start, it closes no more LiveKit rooms, which is warned once, neither
    strays nor those of soft deleted or unplaced rooms, but reconciles
    placements and adopts unplaced rooms all the same. The next one closes
    them."""
    assert reconciliation.CLOSE_BUDGET == timedelta(seconds=60)
    rooms = rooms_in_order(6)
    room_names = [str(room.id) for room in rooms[:4]]
    deleted, unplaced = (str(room.id) for room in rooms[4:])
    close_stray_room = PlacementService.close_stray_room

    with freeze_time(ago(3600)) as clock:
        for room_name in room_names:
            place(room_name, absent_since=ago(60), unwritten_for=60)
            livekit.live("lyon", room_name, "RM_a")
            livekit.live("paris", room_name, "RM_p")
        rooms[4].soft_delete()
        livekit.live("paris", deleted, "RM_d")
        livekit.live("lyon", unplaced, "RM_l", num_participants=2)
        livekit.live("paris", unplaced, "RM_u", num_participants=1)

        def slow_close(*args, **kwargs):
            closed = close_stray_room(*args, **kwargs)
            clock.tick(timedelta(seconds=30))
            return closed

        with (
            mock.patch.object(
                PlacementService, "close_stray_room", side_effect=slow_close
            ),
            caplog.at_level(logging.WARNING, logger="core.livekit.reconciliation"),
        ):
            report = reconcile()

    assert livekit.deleted == [("paris", room_name) for room_name in room_names[:2]]
    assert Placement.objects.get(room_name=unplaced).cluster == "lyon"
    assert report.counts == {Tally.CLOSED: 2, Tally.LIVE_AGAIN: 4, Tally.ADOPTED: 1}
    assert messages(caplog, logging.WARNING) == [
        "The reconciliation has lasted 60 seconds: closing no more LiveKit rooms "
        "until the next reconciliation"
    ]

    report = reconcile()

    assert report.counts == {Tally.CLOSED: 4}
    assert not livekit.rooms["paris"]


@pytest.mark.parametrize(
    ("error", "description"),
    (
        (
            TwirpError("unavailable", "no node available", status=503),
            "ServerError: ServerError(code=unavailable, message=no node available, "
            "status=503)",
        ),
        (TimeoutError(), "TimeoutError"),
        (
            aiohttp.ClientConnectionError("Connection refused"),
            "ClientConnectionError: Connection refused",
        ),
    ),
)
def test_reconcile_unreachable_cluster(
    error, description, livekit, room_cleanup, caplog
):
    """A cluster that cannot be listed is left alone: its placements keep
    their state, and the LiveKit rooms of their rooms live elsewhere are left
    as they are. This is warned, without traceback, and counted, and the other
    clusters are reconciled."""
    absent = place_long_absent(RoomFactory())
    elsewhere = place(RoomFactory())
    livekit.live("paris", elsewhere.room_name, "RM_p")
    on_paris = place(RoomFactory(), "paris")
    livekit.errors["lyon", "list_rooms"] = error

    with caplog.at_level(logging.WARNING, logger="core.livekit.reconciliation"):
        report = reconcile()

    assert_unchanged(absent)
    assert_unchanged(elsewhere)
    assert Placement.objects.get(pk=on_paris.pk).absent_since is not None
    assert report.counts == {Tally.UNREACHABLE_CLUSTERS: 1, Tally.MARKED_ABSENT: 1}
    assert not livekit.deleted
    assert not cleaned_up(room_cleanup)
    [record] = [
        record
        for record in caplog.records
        if record.name == "core.livekit.reconciliation"
    ]
    assert record.levelname == "WARNING"
    assert record.getMessage() == (
        "Could not list the LiveKit rooms live on LiveKit cluster lyon: leaving it "
        f"alone ({description})"
    )
    assert record.exc_info is None


def test_reconcile_absent_placement_kept_while_previous_cluster_unreachable(
    livekit, room_cleanup, caplog
):
    """A placement absent for long enough is kept while the registered cluster
    it was relocated from cannot be listed, in a dry run too, which is logged:
    its meeting may go on there, the relocation having failed to close its
    LiveKit room. It is deleted once that cluster is listed. The placements
    not relocated from it are deleted all the same."""
    room = RoomFactory()
    placement = place_long_absent(room, previous_cluster="paris")
    others = sorted(
        (
            place_long_absent(RoomFactory(), previous_cluster=previous_cluster)
            for previous_cluster in ("", "marseille", "lille")
        ),
        key=lambda other: other.room_name,
    )
    livekit.errors["paris", "list_rooms"] = TimeoutError()
    kept = (
        f"Keeping the placement of LiveKit room {room.id} on LiveKit cluster lyon, "
        f"missing from it since {placement.absent_since.isoformat()}: LiveKit "
        "cluster paris, which it was relocated from, could not be listed"
    )

    with caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"):
        assert reconcile(dry_run=True).counts == {
            Tally.UNREACHABLE_CLUSTERS: 1,
            Tally.DELETED: 3,
        }
        assert Placement.objects.count() == 4
        caplog.clear()
        report = reconcile()

    assert_unchanged(placement)
    assert list(Placement.objects.all()) == [placement]
    assert report.counts == {Tally.UNREACHABLE_CLUSTERS: 1, Tally.DELETED: 3}
    assert cleaned_up(room_cleanup) == [other.room_id for other in others]
    assert messages(caplog, logging.WARNING) == [
        "Could not list the LiveKit rooms live on LiveKit cluster paris: leaving it "
        "alone (TimeoutError)",
    ]
    assert messages(caplog).count(kept) == 1

    del livekit.errors["paris", "list_rooms"]
    report = reconcile()

    assert not Placement.objects.exists()
    assert report.counts == {Tally.DELETED: 1}
    assert cleaned_up(room_cleanup) == [*(other.room_id for other in others), room.id]


def test_reconcile_unexpected_listing_error(livekit):
    """An error listing LiveKit rooms that no unreachable cluster raises is
    raised, nothing being reconciled."""
    placement = place(RoomFactory(), "paris")
    livekit.errors["lyon", "list_rooms"] = RuntimeError("a defect")

    with pytest.raises(RuntimeError, match="a defect"):
        reconcile()

    assert_unchanged(placement)


def test_reconcile_unregistered_cluster(livekit, room_cleanup, caplog):
    """Placements on clusters that are not registered are left alone, and so
    are the LiveKit rooms of their rooms live elsewhere: the next join places
    them again. They are counted, and warned of once."""
    lille = place(RoomFactory(), "lille", absent_since=ago(2 * GRACE))
    nice = place(RoomFactory(), "nice", unwritten_for=2 * GRACE)
    another_on_lille = place(RoomFactory(), "lille")
    livekit.live("paris", nice.room_name, "RM_p")

    with caplog.at_level(logging.WARNING, logger="core.livekit.reconciliation"):
        report = reconcile()

    for placement in (lille, nice, another_on_lille):
        assert_unchanged(placement)
    assert not livekit.deleted
    assert report.counts == {Tally.UNREGISTERED_PLACEMENTS: 3}
    assert not cleaned_up(room_cleanup)
    assert messages(caplog, logging.WARNING) == [
        "3 placement(s) are on LiveKit cluster(s) lille, nice, which are not "
        "registered: leaving them alone, for their next join to place them again"
    ]


def test_reconcile_filtered_rooms(livekit, settings):
    """Rooms are filtered as their webhooks are, each room here by one filter
    only: connection test rooms, the rooms LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX
    leaves out and those not named after a UUID, such as unregistered rooms,
    are left alone, uncounted."""
    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX = r"^[0-9a-z-]+$"
    test_room, filtered_room = RoomFactory.create_batch(2)
    settings.CONNECTION_TEST_ROOM_PREFIX = str(test_room.id)
    room_names = (str(test_room.id), str(filtered_room.id).upper(), "my-room")
    placements = [place(room_name) for room_name in room_names]
    for room_name in room_names:
        livekit.live("paris", room_name, "RM_p")

    report = reconcile()

    for placement in placements:
        assert_unchanged(placement)
    assert not livekit.deleted
    assert report == ReconciliationReport()


def test_reconcile_rooms_named_after_no_room(livekit, caplog):
    """LiveKit rooms live without placement named after no room are left
    alone: they are counted, and warned of once."""
    room_names = [str(uuid.uuid4()) for _room in range(2)]
    livekit.live("paris", room_names[0], "RM_p")
    livekit.live("lyon", room_names[0], "RM_l")
    livekit.live("lyon", room_names[1], "RM_b")

    with caplog.at_level(logging.WARNING, logger="core.livekit.reconciliation"):
        report = reconcile()

    assert not Placement.objects.exists()
    assert not livekit.deleted
    assert report.counts == {Tally.FOREIGN_ROOMS: 2}
    assert messages(caplog, logging.WARNING) == [
        "2 LiveKit room(s) live without placement are named after no room: leaving "
        "them alone"
    ]


def test_reconcile_deleted_room_closed(livekit, settings):
    """The LiveKit rooms of a soft deleted room are closed, without placing
    it, nor recording its start."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    room.soft_delete()
    room_name = str(room.id)
    livekit.live("paris", room_name, "RM_p")
    livekit.live("lyon", room_name, "RM_l")

    with mock.patch.object(SIPManagement, "ensure_dispatch_rule") as ensure:
        report = reconcile()

    assert livekit.deleted == [("paris", room_name), ("lyon", room_name)]
    assert not Placement.objects.exists()
    assert report.counts == {Tally.CLOSED: 2}
    ensure.assert_not_called()
    room.refresh_from_db()
    assert room.last_started_at is None


def test_reconcile_placed_deleted_room_closed(livekit):
    """The LiveKit rooms of a placed room that was soft deleted are closed,
    on its cluster too, and its placement is left to the next
    reconciliation, which marks it absent."""
    room = RoomFactory()
    placement = place(room, sid="RM_old")
    room.soft_delete()
    room_name = str(room.id)
    livekit.live("paris", room_name, "RM_p")
    livekit.live("lyon", room_name, "RM_new")

    report = reconcile()

    assert livekit.deleted == [("paris", room_name), ("lyon", room_name)]
    assert_unchanged(placement)
    assert report.counts == {Tally.CLOSED: 2}

    report = reconcile()

    assert Placement.objects.get().absent_since is not None
    assert report.counts == {Tally.MARKED_ABSENT: 1}


def test_reconcile_adopts_unplaced_room(livekit, audit_events):
    """A LiveKit room live without placement is adopted on its cluster, with
    its SID, which is audited with the reconciliation as source. The start of
    its room is recorded, as its room_started was lost."""
    room = RoomFactory()
    room_name = str(room.id)
    livekit.live("lyon", room_name, "RM_l")

    report = reconcile()

    placement = Placement.objects.get()
    assert placement.room == room
    assert placement.cluster == "lyon"
    assert placement.sid == "RM_l"
    assert report.counts == {Tally.ADOPTED: 1}
    [event] = audit_events
    assert event["event"]["action"] == "livekit.placement.adopt"
    assert event["lasuite"]["details"] == {
        "cluster": "lyon",
        "sid": "RM_l",
        "source": "reconciliation",
    }
    room.refresh_from_db()
    assert room.last_started_at is not None
    assert not livekit.deleted


@pytest.mark.parametrize(
    ("live", "adopted_on"),
    (
        pytest.param(
            {"paris": (2, 1), "lyon": (5, 2), "marseille": (1, 0)},
            "lyon",
            id="most-participants",
        ),
        pytest.param(
            {"paris": (3, 9), "lyon": (3, 4), "marseille": (3, 0)},
            "lyon",
            id="oldest",
        ),
        pytest.param(
            {"paris": (3, 4), "lyon": (3, 4), "marseille": (1, 1)},
            "paris",
            id="registry-order",
        ),
    ),
)
def test_reconcile_adopts_biggest_room(live, adopted_on, livekit, audit_events):
    """Of the LiveKit rooms live for a room without placement, the one with the
    most participants is adopted, then the oldest, one created at an unknown
    time being taken for the newest, then the first registered. The others are
    closed."""
    room = RoomFactory()
    room_name = str(room.id)
    for cluster_name, (participants, created) in live.items():
        livekit.live(
            cluster_name,
            room_name,
            f"RM_{cluster_name}",
            num_participants=participants,
            creation_time_ms=created and CREATED_LIVEKIT_ROOM_TIME_MS + created,
        )

    report = reconcile()

    placement = Placement.objects.get()
    assert placement.cluster == adopted_on
    assert placement.sid == f"RM_{adopted_on}"
    assert list(livekit.rooms[adopted_on]) == [room_name]
    assert sorted(livekit.deleted) == sorted(
        (cluster_name, room_name) for cluster_name in live if cluster_name != adopted_on
    )
    assert report.counts == {Tally.ADOPTED: 1, Tally.CLOSED: 2}
    assert len(find_events(audit_events, "livekit.placement.adopt")) == 1


def test_reconcile_unplaced_room_on_cluster_weighing_zero(livekit, settings):
    """A LiveKit room live without placement on clusters weighing 0 only is
    closed, as when it starts there: it is placed nowhere. One also live on a
    candidate is adopted there, even when smaller."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry("paris"),
            livekit_cluster_entry("lyon", weight=0),
            livekit_cluster_entry("marseille", weight=0),
        ]
    )
    only_on_lyon, also_on_paris = (str(RoomFactory().id) for _room in range(2))
    livekit.live("lyon", only_on_lyon, "RM_l")
    livekit.live("lyon", also_on_paris, "RM_l", num_participants=5)
    livekit.live("paris", also_on_paris, "RM_p", num_participants=1)

    report = reconcile()

    assert list(Placement.objects.values_list("room_name", "cluster", "sid")) == [
        (also_on_paris, "paris", "RM_p")
    ]
    assert sorted(livekit.deleted) == sorted(
        [("lyon", only_on_lyon), ("lyon", also_on_paris)]
    )
    assert report.counts == {Tally.ADOPTED: 1, Tally.CLOSED: 2}


def test_reconcile_unplaced_room_without_candidate(livekit, settings):
    """A LiveKit room live without placement while no cluster may receive new
    placements is left alone."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry("paris", weight=0),
            livekit_cluster_entry("lyon", weight=0),
        ]
    )
    room_name = str(RoomFactory().id)
    livekit.live("paris", room_name, "RM_p")
    livekit.live("lyon", room_name, "RM_l")

    assert reconcile(dry_run=True) == ReconciliationReport()

    report = reconcile()

    assert not Placement.objects.exists()
    assert not livekit.deleted
    assert report == ReconciliationReport()


def test_reconcile_unplaced_room_close_failure(livekit):
    """A cluster failing to close a LiveKit room of a room adopted elsewhere is
    counted, the adoption standing."""
    room_name = str(RoomFactory().id)
    livekit.live("paris", room_name, "RM_p", num_participants=2)
    livekit.live("lyon", room_name, "RM_l", num_participants=1)
    livekit.errors["lyon", "delete_room"] = TimeoutError()

    report = reconcile()

    placement = Placement.objects.get()
    assert (placement.cluster, placement.sid) == ("paris", "RM_p")
    assert not livekit.deleted
    assert report.counts == {Tally.ADOPTED: 1, Tally.FAILED_CLOSES: 1}


def test_reconcile_unplaced_room_placed_meanwhile(livekit):
    """A LiveKit room live without placement whose room was placed meanwhile
    on another cluster is closed, as when it starts there, nothing being
    adopted."""
    room = RoomFactory()
    room_name = str(room.id)
    livekit.live("lyon", room_name, "RM_l")

    with changing_once_read(lambda: place(room, "paris", "RM_p")):
        report = reconcile()

    placement = Placement.objects.get()
    assert (placement.cluster, placement.sid) == ("paris", "RM_p")
    assert livekit.deleted == [("lyon", room_name)]
    assert report.counts == {Tally.CLOSED: 1}


def test_reconcile_unplaced_room_placement_kept_changing(livekit, caplog):
    """The LiveKit rooms of a room without placement whose placement keeps
    changing while one is recorded are left to the next reconciliation."""
    room = RoomFactory()
    room_name = str(room.id)
    livekit.live("paris", room_name, "RM_p", num_participants=2)
    livekit.live("lyon", room_name, "RM_l", num_participants=1)

    with (
        mock.patch.object(
            PlacementService,
            "record_started",
            side_effect=PlacementChangedError("kept changing"),
        ) as record_started,
        caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"),
    ):
        report = reconcile()

    record_started.assert_called_once()
    assert record_started.call_args.args[0].name == "paris"
    assert report == ReconciliationReport()
    assert not livekit.deleted
    assert messages(caplog) == [changed_meanwhile(room_name)]


def setup_every_action(livekit):
    """Set up a room for each action a reconciliation may take, by name of that
    action, and return the rooms."""
    names = (
        "mark",
        "delete",
        "repair",
        "again",
        "stray",
        "adopt",
        "deleted",
    )
    rooms = dict(zip(names, (RoomFactory() for _name in names), strict=True))
    place(rooms["mark"])
    place_long_absent(rooms["delete"])
    place(rooms["repair"], sid="RM_old")
    livekit.live("lyon", str(rooms["repair"].id), "RM_new")
    place(rooms["again"], absent_since=ago(60))
    livekit.live("lyon", str(rooms["again"].id), "RM_a")
    place(rooms["stray"], "paris", "RM_p")
    livekit.live("paris", str(rooms["stray"].id), "RM_p")
    livekit.live("lyon", str(rooms["stray"].id), "RM_l")
    livekit.live("marseille", str(rooms["adopt"].id), "RM_m", num_participants=2)
    livekit.live("paris", str(rooms["adopt"].id), "RM_x", num_participants=1)
    rooms["deleted"].soft_delete()
    livekit.live("lyon", str(rooms["deleted"].id), "RM_d")
    return rooms


EVERY_ACTION = {
    Tally.MARKED_ABSENT: 1,
    Tally.DELETED: 1,
    Tally.REPAIRED: 1,
    Tally.LIVE_AGAIN: 1,
    Tally.CLOSED: 3,
    Tally.ADOPTED: 1,
}


EVERY_AUDIT = [
    "livekit.placement.adopt",
    "livekit.placement.delete",
    "livekit.placement.repair",
    "livekit.room.close",
    "livekit.room.close",
]


def every_deletion(rooms):
    """Return the LiveKit rooms a reconciliation of the rooms set up for every
    action deletes, as sorted pairs of cluster and room names."""
    return sorted(
        [
            ("lyon", str(rooms["stray"].id)),
            ("lyon", str(rooms["deleted"].id)),
            ("paris", str(rooms["adopt"].id)),
        ]
    )


def test_reconcile_every_action(livekit, room_cleanup, audit_events):
    """A reconciliation may take every action at once, each counted."""
    rooms = setup_every_action(livekit)

    report = reconcile()

    assert report.counts == EVERY_ACTION
    assert sorted(livekit.deleted) == every_deletion(rooms)
    assert sorted(event["event"]["action"] for event in audit_events) == EVERY_AUDIT
    assert cleaned_up(room_cleanup) == [rooms["delete"].id]


def test_reconcile_dry_run(livekit, room_cleanup, audit_events, caplog):
    """A dry run counts the actions a reconciliation would take, and logs
    them, without writing nor closing anything."""
    rooms = setup_every_action(livekit)
    placements = list(Placement.objects.all())

    with caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"):
        report = reconcile(dry_run=True)

    assert report.counts == EVERY_ACTION
    for placement in placements:
        assert_unchanged(placement)
    assert Placement.objects.count() == len(placements)
    assert not livekit.deleted
    assert not audit_events
    assert not cleaned_up(room_cleanup)
    for room in rooms.values():
        room.refresh_from_db()
        assert room.last_started_at is None
    logged = messages(caplog)
    assert len(logged) == sum(EVERY_ACTION.values())
    assert all(message.startswith("Would ") for message in logged)
    assert (
        f"Would adopt LiveKit room {rooms['adopt'].id}, live without placement on "
        "LiveKit cluster marseille with SID RM_m"
    ) in logged
    assert (
        f"Would close LiveKit room {rooms['adopt'].id} on LiveKit cluster paris, "
        "live there without placement"
    ) in logged


def test_reconcile_dry_run_skips_absence_after_planned_close(livekit):
    """A dry run counts a placement whose LiveKit room it would close elsewhere
    as a reconciliation would: left to the next one."""
    placement = place(RoomFactory())
    livekit.live("paris", placement.room_name, "RM_p")

    report = reconcile(dry_run=True)

    assert report.counts == {Tally.CLOSED: 1}
    assert_unchanged(placement)
    assert not livekit.deleted


def test_reconcile_beside_another_run(livekit, room_cleanup, audit_events, caplog):
    """Nothing keeps two reconciliations apart: one running while another
    reconciles too. Each change is made, audited and followed by its cleanup
    once, by the first of the two to reach it: the other one finds each
    placement changed meanwhile, and each LiveKit room closed or adopted
    already."""
    rooms = setup_every_action(livekit)
    other_reports = []
    other_runs = iter([reconcile])

    def run_another():
        for other_run in other_runs:
            other_reports.append(other_run())

    with (
        changing_once_read(run_another),
        caplog.at_level(logging.INFO, logger="core.livekit.reconciliation"),
    ):
        report = reconcile()

    assert [other_report.counts for other_report in other_reports] == [EVERY_ACTION]
    assert report == ReconciliationReport()
    assert sorted(livekit.deleted) == every_deletion(rooms)
    assert sorted(event["event"]["action"] for event in audit_events) == EVERY_AUDIT
    assert cleaned_up(room_cleanup) == [rooms["delete"].id]
    assert caplog.text.count("changed while it was reconciled") == 4
    adopted = Placement.objects.get(room_name=str(rooms["adopt"].id))
    assert (adopted.cluster, adopted.sid) == ("marseille", "RM_m")
