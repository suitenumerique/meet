"""Unit tests for the placements of LiveKit rooms on the LiveKit clusters."""

# pylint: disable=too-many-lines

import json
import logging
import uuid
from unittest import mock

from django.db.models import F
from django.utils import timezone

import aiohttp
import pytest

from core.audit.testing import find_events
from core.factories import RoomFactory, UserFactory
from core.livekit.clusters import get_default_livekit_cluster, get_livekit_clusters
from core.livekit.exceptions import (
    LiveKitRoomCloseError,
    LiveKitRoomCreationError,
    LiveKitRoomEndedError,
    NoCandidateLiveKitClusterError,
    PlacementChangedError,
    RelocationRefusedError,
)
from core.livekit.placements import (
    ENSURE_ROOM,
    PLACEMENT_CREATION_ATTEMPTS,
    PLACEMENT_UPDATE_ATTEMPTS,
    JoinIntent,
    LiveKitRoomFailure,
    LiveKitRoomLocation,
    PlacementService,
)
from core.livekit.strategies import PlacementContext, WeightedRandomStrategy
from core.models import Placement
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)
from core.tests.utils import (
    CREATED_LIVEKIT_ROOM_SID,
    changing_after_reads,
    livekit_cluster_entry,
    livekit_room,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(name="room_management")
def room_management_fixture():
    """Mock the management of LiveKit rooms on their clusters.

    Return a mock whose update_metadata and delete_room stand for those of
    RoomManagement, its mock_calls listing their calls in order.
    """
    manager = mock.Mock()
    with (
        mock.patch.object(RoomManagement, "update_metadata", manager.update_metadata),
        mock.patch.object(RoomManagement, "delete_room", manager.delete_room),
    ):
        yield manager


@pytest.fixture(name="three_livekit_clusters")
def three_livekit_clusters_fixture(settings):
    """Register the Paris, Lyon and Marseille LiveKit clusters, Paris being the
    default. Return the three clusters, in that order."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry(name) for name in ("paris", "lyon", "marseille")]
    )
    return get_livekit_clusters()


def assert_placement_unchanged(placement):
    """Assert that a placement is the only one, as it was."""
    kept_placement = Placement.objects.get()
    assert kept_placement.pk == placement.pk
    assert kept_placement.cluster == placement.cluster
    assert kept_placement.sid == placement.sid
    assert kept_placement.epoch == placement.epoch
    assert kept_placement.updated_at == placement.updated_at


def picking(cluster):
    """Patch the default placement strategy to pick a cluster."""
    return mock.patch.object(
        WeightedRandomStrategy, "choose", autospec=True, return_value=cluster
    )


def choosing_while_changed(cluster, change):
    """
    Patch the default placement strategy to pick a cluster, the placement of
    the LiveKit room being changed by another request the first time it is
    asked.
    """
    asked = []

    def choose(_strategy, _candidates, context):
        if not asked:
            change(context.room_name)
        asked.append(context)
        return cluster

    return mock.patch.object(
        WeightedRandomStrategy, "choose", autospec=True, side_effect=choose
    )


def closing_calls(cluster, room_name="my-room"):
    """Return the calls closing a LiveKit room on a cluster: its deletion alone,
    nothing being announced in its metadata."""
    return [mock.call.delete_room(room_name, cluster=cluster)]


LAZY = JoinIntent(ensure_room=False)
MISSING = JoinIntent(
    ensure_room=False, failure=LiveKitRoomFailure.MISSING, failed_room_sid="RM_failed"
)
DELETED = JoinIntent(
    ensure_room=False, failure=LiveKitRoomFailure.DELETED, failed_room_sid="RM_failed"
)


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


def test_place_new_room(two_livekit_clusters, fake_livekit_room_creation, caplog):
    """
    A LiveKit room without placement is placed on the cluster the placement
    strategy picks
    """
    paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    fake_livekit_room_creation.return_value = livekit_room("RM_new")

    with (
        picking(lyon) as choose,
        caplog.at_level(logging.INFO, logger="core.livekit.placements"),
    ):
        location = PlacementService.place(room)

    assert location == LiveKitRoomLocation(cluster=lyon, sid="RM_new")
    choose.assert_called_once_with(
        mock.ANY, (paris, lyon), PlacementContext(room_name=room_name, room=room)
    )
    fake_livekit_room_creation.assert_called_once_with(room_name, cluster=lyon)

    placement = Placement.objects.get()
    assert placement.room_name == room_name
    assert placement.room == room
    assert placement.cluster == "lyon"
    assert placement.sid == "RM_new"
    assert placement.epoch == 0
    assert placement.absent_since is None
    assert f"Placed LiveKit room {room_name} on LiveKit cluster lyon" in caplog.text


def test_place_placed_room(two_livekit_clusters, fake_livekit_room_creation):
    """
    A placed LiveKit room is created again on the cluster of its placement,
    without asking the placement strategy
    """
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    placement = Placement.objects.create(
        room_name=str(room.id),
        room=room,
        cluster="lyon",
        sid="RM_old",
        epoch=2,
        absent_since=timezone.now(),
    )
    fake_livekit_room_creation.return_value = livekit_room("RM_new")

    with mock.patch.object(WeightedRandomStrategy, "choose") as choose:
        location = PlacementService.place(room)

    assert location == LiveKitRoomLocation(cluster=lyon, sid="RM_new")
    choose.assert_not_called()
    fake_livekit_room_creation.assert_called_once_with(str(room.id), cluster=lyon)

    placed = Placement.objects.get()
    assert placed.pk == placement.pk
    assert placed.sid == "RM_new"
    assert placed.absent_since is None
    assert placed.epoch == 2
    assert placed.updated_at > placement.updated_at


def test_place_twice(two_livekit_clusters, fake_livekit_room_creation):
    """
    A LiveKit room placed by a first call keeps its placement on the next
    ones, which do not ask the placement strategy.
    """
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)

    with picking(lyon) as choose:
        clusters = [PlacementService.place(room).cluster for _call in range(2)]

    assert clusters == [lyon, lyon]
    choose.assert_called_once()
    assert (
        fake_livekit_room_creation.call_args_list
        == [mock.call(room_name, cluster=lyon)] * 2
    )
    assert Placement.objects.get().cluster == "lyon"


def test_place_on_cluster_weighing_zero(settings, fake_livekit_room_creation):
    """
    A LiveKit room placed on a cluster that receives no new placements stays
    there.
    """
    room = RoomFactory()
    room_name = str(room.id)
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon", weight=0)]
    )
    Placement.objects.create(room_name=room_name, cluster="lyon")

    assert PlacementService.place(room).cluster.name == "lyon"
    assert Placement.objects.get().cluster == "lyon"
    fake_livekit_room_creation.assert_called_once()


def test_place_concurrently(two_livekit_clusters, fake_livekit_room_creation):
    """
    Requests placing a LiveKit room at the same time all end on the one
    placement created first, whatever the placement strategy picked for each.

    Here, while the strategy picks Paris for a first request, a second one
    places the LiveKit room on Lyon.
    """
    paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    picks = iter((paris, lyon))
    concurrent_clusters = []

    def choose(_strategy, _candidates, context):
        pick = next(picks)
        if pick == paris:
            concurrent_clusters.append(PlacementService.place(context.room).cluster)
        return pick

    with mock.patch.object(
        WeightedRandomStrategy, "choose", autospec=True, side_effect=choose
    ):
        cluster = PlacementService.place(room).cluster

    assert cluster == lyon
    assert concurrent_clusters == [lyon]

    placement = Placement.objects.get()

    assert placement.cluster == "lyon"
    assert placement.sid == CREATED_LIVEKIT_ROOM_SID
    assert (
        fake_livekit_room_creation.call_args_list
        == [mock.call(room_name, cluster=lyon)] * 2
    )


def test_place_placed_meanwhile_creation_failure(
    two_livekit_clusters, fake_livekit_room_creation
):
    """
    A concurrent placement should stay when there is a LiveKit API error
    """
    paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    fake_livekit_room_creation.side_effect = LiveKitRoomCreationError("Timed out")
    bulk_create = Placement.objects.bulk_create

    def placed_meanwhile(objs, **kwargs):
        Placement.objects.create(room_name=objs[0].room_name, cluster="paris")
        return bulk_create(objs, **kwargs)

    with (
        picking(lyon),
        mock.patch.object(
            Placement.objects, "bulk_create", side_effect=placed_meanwhile
        ),
        pytest.raises(LiveKitRoomCreationError),
    ):
        PlacementService.place(room)

    fake_livekit_room_creation.assert_called_once_with(room_name, cluster=paris)
    assert Placement.objects.get().cluster == "paris"


def test_place_new_room_creation_failure(
    two_livekit_clusters, fake_livekit_room_creation, caplog
):
    """
    A placement created by a call whose cluster fails to create the LiveKit
    room is deleted, so that the next call may place the LiveKit room on
    another cluster.
    """
    paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    fake_livekit_room_creation.side_effect = LiveKitRoomCreationError("Timed out")

    with (
        picking(lyon),
        caplog.at_level(logging.INFO, logger="core.livekit.placements"),
        pytest.raises(LiveKitRoomCreationError, match="Timed out"),
    ):
        PlacementService.place(room)

    fake_livekit_room_creation.assert_called_once_with(room_name, cluster=lyon)
    assert not Placement.objects.exists()
    assert (
        f"Deleted the placement of LiveKit room {room_name} on LiveKit cluster "
        "lyon, which failed to create it"
    ) in caplog.text

    fake_livekit_room_creation.side_effect = None
    with picking(paris):
        assert PlacementService.place(room).cluster == paris
    assert Placement.objects.get().cluster == "paris"


@pytest.mark.usefixtures("two_livekit_clusters")
@pytest.mark.parametrize("sid", ("", "RM_old"))
def test_place_placed_room_creation_failure(sid, fake_livekit_room_creation):
    """
    The placement of a LiveKit room placed earlier stays when its cluster
    fails to create the LiveKit room.
    """
    room = RoomFactory()
    room_name = str(room.id)
    placement = Placement.objects.create(room_name=room_name, cluster="lyon", sid=sid)
    fake_livekit_room_creation.side_effect = LiveKitRoomCreationError("Timed out")

    with pytest.raises(LiveKitRoomCreationError):
        PlacementService.place(room)

    kept_placement = Placement.objects.get()
    assert kept_placement.cluster == "lyon"
    assert kept_placement.sid == sid
    assert kept_placement.updated_at == placement.updated_at


def change_during_first_creation(**changes):
    """
    Return a fake LiveKit room creation during the first of which the
    placement of the LiveKit room is updated with these changes, or deleted
    without any.
    """
    sids = iter(("RM_first", "RM_second"))

    def create_room(room_name, **_kwargs):
        sid = next(sids)
        if sid == "RM_first":
            placements = Placement.objects.filter(room_name=room_name)
            if changes:
                placements.update(**changes)
            else:
                placements.delete()
        return livekit_room(sid)

    return create_room


@pytest.mark.usefixtures("two_livekit_clusters")
@pytest.mark.parametrize(
    ("changes", "expected_cluster", "expected_epoch"),
    (
        pytest.param({"sid": "RM_other"}, "lyon", 0, id="sid"),
        pytest.param({"epoch": 1}, "lyon", 1, id="epoch"),
        pytest.param(
            {"cluster": "paris", "previous_cluster": "lyon", "epoch": 1},
            "paris",
            1,
            id="relocated",
        ),
        pytest.param({}, "paris", 0, id="deleted"),
    ),
)
def test_place_changed_meanwhile(
    changes,
    expected_cluster,
    expected_epoch,
    fake_livekit_room_creation,
    room_management,
):
    """
    A placement that changed while its cluster created the LiveKit room is
    read again, and the LiveKit room created once more where it now says, or
    placed again when it is gone. When that is another cluster, the LiveKit
    room created on the first one is left there.
    """
    paris, lyon = get_livekit_clusters()
    room = RoomFactory()
    room_name = str(room.id)
    Placement.objects.create(room_name=room_name, cluster="lyon")
    fake_livekit_room_creation.side_effect = change_during_first_creation(**changes)
    room_management.attach_mock(fake_livekit_room_creation, "create_room")

    with picking(paris):
        location = PlacementService.place(room)

    assert location.cluster.name == expected_cluster
    assert location.sid == "RM_second"
    assert room_management.mock_calls == [
        mock.call.create_room(room_name, cluster=lyon),
        mock.call.create_room(room_name, cluster=location.cluster),
    ]

    placement = Placement.objects.get()
    assert placement.cluster == expected_cluster
    assert placement.epoch == expected_epoch
    assert placement.sid == "RM_second"


@pytest.mark.parametrize("sid", ("", "RM_earlier"))
@pytest.mark.parametrize("absent", (False, True))
def test_place_given_the_created_sid_meanwhile(
    sid,
    absent,
    two_livekit_clusters,
    fake_livekit_room_creation,
    django_assert_num_queries,
):
    """
    A placement given, while its cluster created the LiveKit room, the very
    SID the cluster returns, as by another request joining at the same time,
    is the one credentials are handed out for: it is not read again, nor the
    LiveKit room created once more, and it is no longer absent.
    """
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    Placement.objects.create(room_name=room_name, cluster="lyon", sid=sid)
    fake_livekit_room_creation.side_effect = change_during_first_creation(
        sid="RM_first", absent_since=timezone.now() if absent else None
    )

    placement_read = 1
    change_meanwhile = 1
    sid_update = 1
    with django_assert_num_queries(placement_read + change_meanwhile + sid_update):
        location = PlacementService.place(room)

    assert location == LiveKitRoomLocation(cluster=lyon, sid="RM_first")
    fake_livekit_room_creation.assert_called_once_with(room_name, cluster=lyon)

    placement = Placement.objects.get()
    assert placement.cluster == "lyon"
    assert placement.epoch == 0
    assert placement.sid == "RM_first"
    assert placement.absent_since is None


def test_place_racing_relocation(
    two_livekit_clusters, fake_livekit_room_creation, room_management, audit_events
):
    """
    A join racing a relocation, whose LiveKit room creation may bring back to
    life the LiveKit room the relocation just closed, creates it on the cluster
    the room moved to, which credentials are handed out for. The LiveKit room
    brought back to life on the cluster left behind is not closed by the join.
    """
    paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    Placement.objects.create(
        room_name=room_name, room=room, cluster="paris", sid="RM_a"
    )
    sids = iter(("RM_revived", "RM_new"))

    def create_room(name, *, cluster):
        if cluster == paris:
            PlacementService.relocate(name, "lyon", actor=UserFactory())
        return livekit_room(next(sids))

    fake_livekit_room_creation.side_effect = create_room
    room_management.attach_mock(fake_livekit_room_creation, "create_room")

    assert PlacementService.place(room).cluster == lyon

    assert room_management.mock_calls == [
        mock.call.create_room(room_name, cluster=paris),
        *closing_calls(paris, room_name),
        mock.call.create_room(room_name, cluster=lyon),
    ]
    placement = Placement.objects.get()
    assert placement.cluster == "lyon"
    assert placement.previous_cluster == "paris"
    assert placement.epoch == 1
    assert placement.sid == "RM_new"
    (closing_by_relocation,) = find_events(audit_events, "livekit.room.close")
    assert closing_by_relocation["lasuite"]["actor"]["type"] == "user"


def test_place_keeps_changing(two_livekit_clusters, fake_livekit_room_creation, caplog):
    """
    A placement that changes again while its cluster creates the LiveKit room
    once more is left as it is.
    """
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    Placement.objects.create(room_name=room_name, cluster="lyon")

    def bump_epoch_each_time(room_name, **_kwargs):
        Placement.objects.filter(room_name=room_name).update(epoch=F("epoch") + 1)
        return livekit_room("RM_new")

    fake_livekit_room_creation.side_effect = bump_epoch_each_time

    with (
        caplog.at_level(logging.WARNING, logger="core.livekit.placements"),
        pytest.raises(PlacementChangedError, match="kept changing"),
    ):
        PlacementService.place(room)

    assert (
        fake_livekit_room_creation.call_args_list
        == [mock.call(room_name, cluster=lyon)] * PLACEMENT_UPDATE_ATTEMPTS
    )
    placement = Placement.objects.get()
    assert placement.epoch == PLACEMENT_UPDATE_ATTEMPTS
    assert placement.sid == ""
    assert (
        f"Placement of LiveKit room {room_name} kept changing while its LiveKit "
        "room was created"
    ) in caplog.text


@pytest.mark.parametrize(
    "intent", (ENSURE_ROOM, LAZY, DELETED), ids=("ensure", "lazy", "deleted")
)
def test_place_on_unregistered_cluster(
    intent, two_livekit_clusters, fake_livekit_room_creation, caplog
):
    """
    A LiveKit room placed on a cluster since removed from the registry is
    placed again, with a warning, unless reported deleted with its SID.
    """
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    unregistered = Placement.objects.create(
        room_name=room_name, cluster="lille", sid="RM_old"
    )

    with (
        picking(lyon),
        caplog.at_level(logging.WARNING, logger="core.livekit.placements"),
    ):
        assert PlacementService.place(room, intent).cluster == lyon

    placement = Placement.objects.get()
    assert placement.pk != unregistered.pk
    assert placement.cluster == "lyon"
    assert placement.sid == CREATED_LIVEKIT_ROOM_SID
    fake_livekit_room_creation.assert_called_once_with(room_name, cluster=lyon)
    assert (
        f"LiveKit room {room_name} is placed on LiveKit cluster lille, which is "
        "not registered: placing it again"
    ) in caplog.text


def test_place_without_candidate(settings, fake_livekit_room_creation):
    """
    A LiveKit room cannot be placed while no cluster may receive new
    placements.
    """
    room = RoomFactory()
    settings.LIVEKIT_CLUSTERS = json.dumps([livekit_cluster_entry("paris", weight=0)])

    with pytest.raises(NoCandidateLiveKitClusterError):
        PlacementService.place(room)

    assert not Placement.objects.exists()
    fake_livekit_room_creation.assert_not_called()


@pytest.mark.parametrize(
    "intent",
    (
        pytest.param(LAZY, id="lazy"),
        pytest.param(MISSING, id="missing"),
        pytest.param(DELETED, id="deleted"),
        pytest.param(
            JoinIntent(failure=LiveKitRoomFailure.DELETED, failed_room_sid="RM_failed"),
            id="deleted-ensuring",
        ),
    ),
)
def test_place_known_live_room(
    intent, two_livekit_clusters, fake_livekit_room_creation, django_assert_num_queries
):
    """A LiveKit room known to be live is returned as it is, on a single read."""
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    placement = Placement.objects.create(
        room_name=room_name, cluster="lyon", sid="RM_live"
    )

    with django_assert_num_queries(1):
        location = PlacementService.place(room, intent)

    assert location == LiveKitRoomLocation(cluster=lyon, sid="RM_live")
    fake_livekit_room_creation.assert_not_called()
    assert_placement_unchanged(placement)


@pytest.mark.usefixtures("two_livekit_clusters")
@pytest.mark.parametrize(
    "placed",
    (
        pytest.param(None, id="without-placement"),
        pytest.param({"sid": "RM_failed"}, id="same-sid"),
        pytest.param(
            {"sid": "RM_failed", "cluster": "lille"}, id="same-sid-unregistered-cluster"
        ),
    ),
)
def test_place_ended_meeting(
    placed, fake_livekit_room_creation, django_assert_num_queries, caplog
):
    """
    A LiveKit room reported deleted ended its meeting when it has no placement,
    or one still recording its SID: nothing is written, nor created.
    """
    room = RoomFactory()
    room_name = str(room.id)
    if placed is not None:
        Placement.objects.create(room_name=room_name, **{"cluster": "lyon", **placed})
    placements = list(Placement.objects.values())

    with (
        caplog.at_level(logging.INFO, logger="core.livekit.placements"),
        django_assert_num_queries(1),
        pytest.raises(LiveKitRoomEndedError),
    ):
        PlacementService.place(room, DELETED)

    fake_livekit_room_creation.assert_not_called()
    assert list(Placement.objects.values()) == placements
    assert (
        f"LiveKit room {room_name} reported deleted with SID 'RM_failed'" in caplog.text
    )


@pytest.mark.parametrize(
    ("intent", "sid"),
    (
        pytest.param(LAZY, None, id="lazy-without-placement"),
        pytest.param(LAZY, "", id="lazy-without-sid"),
        pytest.param(MISSING, None, id="missing-without-placement"),
        pytest.param(MISSING, "RM_failed", id="missing-same-sid"),
        pytest.param(MISSING, "", id="missing-without-sid"),
        pytest.param(DELETED, "", id="deleted-without-sid"),
    ),
)
def test_place_room_not_known_live(
    intent, sid, two_livekit_clusters, fake_livekit_room_creation
):
    """A LiveKit room not known to be live is ensured, unless its meeting ended."""
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    if sid is not None:
        Placement.objects.create(room_name=room_name, cluster="lyon", sid=sid)
    fake_livekit_room_creation.return_value = livekit_room("RM_new")

    with picking(lyon):
        location = PlacementService.place(room, intent)

    assert location == LiveKitRoomLocation(cluster=lyon, sid="RM_new")
    fake_livekit_room_creation.assert_called_once_with(room_name, cluster=lyon)
    placement = Placement.objects.get()
    assert placement.cluster == "lyon"
    assert placement.sid == "RM_new"


def test_place_missing_room_replaced_meanwhile(
    two_livekit_clusters, fake_livekit_room_creation
):
    """
    A LiveKit room reported missing, given another SID while its cluster
    created it again, is followed to that SID once its placement is read
    again, without creating it once more.
    """
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room_name = str(room.id)
    Placement.objects.create(room_name=room_name, cluster="lyon", sid="RM_failed")
    fake_livekit_room_creation.side_effect = change_during_first_creation(
        sid="RM_other"
    )

    location = PlacementService.place(room, MISSING)

    assert location == LiveKitRoomLocation(cluster=lyon, sid="RM_other")
    fake_livekit_room_creation.assert_called_once_with(room_name, cluster=lyon)
    assert Placement.objects.get().sid == "RM_other"


@pytest.mark.usefixtures("two_livekit_clusters")
def test_place_deleted_room_gone_meanwhile(fake_livekit_room_creation):
    """
    A LiveKit room reported deleted, whose placement is gone once read again
    after its cluster created it, ended its meeting: it is not placed again.
    """
    room = RoomFactory()
    room_name = str(room.id)
    Placement.objects.create(room_name=room_name, cluster="lyon")
    fake_livekit_room_creation.side_effect = change_during_first_creation()

    with pytest.raises(LiveKitRoomEndedError):
        PlacementService.place(room, DELETED)

    fake_livekit_room_creation.assert_called_once()
    assert not Placement.objects.exists()


def started(sid="RM_started"):
    """Return the LiveKit room my-room, as a cluster tells it started."""
    return livekit_room(sid, name="my-room")


@pytest.mark.parametrize("absent", (False, True))
def test_record_started_on_its_placement(
    absent, two_livekit_clusters, room_management, caplog
):
    """
    A LiveKit room started on the cluster of a placement without SID, as one
    whose LiveKit room is being created, is the LiveKit room its room is placed
    on: its SID is recorded, and it is no longer absent.
    """
    _paris, lyon = two_livekit_clusters
    placement = Placement.objects.create(
        room_name="my-room",
        cluster="lyon",
        epoch=1,
        absent_since=timezone.now() if absent else None,
    )

    with caplog.at_level(logging.INFO, logger="core.livekit.placements"):
        assert PlacementService.record_started(lyon, started()) is True

    recorded = Placement.objects.get()
    assert recorded.pk == placement.pk
    assert recorded.cluster == "lyon"
    assert recorded.sid == "RM_started"
    assert recorded.absent_since is None
    assert recorded.epoch == 1
    assert recorded.updated_at > placement.updated_at
    assert not room_management.mock_calls
    assert (
        "Recorded LiveKit room my-room started on LiveKit cluster lyon with SID "
        "RM_started"
    ) in caplog.text


def test_record_started_known_sid(
    two_livekit_clusters, room_management, django_assert_num_queries
):
    """
    A LiveKit room started with the SID its placement records is the LiveKit
    room its room is placed on, and the placement is left as it is.
    """
    _paris, lyon = two_livekit_clusters
    placement = Placement.objects.create(
        room_name="my-room", cluster="lyon", sid="RM_started"
    )

    with django_assert_num_queries(1):
        assert PlacementService.record_started(lyon, started()) is True

    assert_placement_unchanged(placement)
    assert not room_management.mock_calls


def test_record_started_another_sid(two_livekit_clusters, room_management, caplog):
    """
    A LiveKit room started on the cluster of a placement with another SID is
    taken for the LiveKit room its room is placed on, and the SID recorded is
    kept: joins record the SID of the LiveKit rooms they create, and a webhook
    may be late.
    """
    _paris, lyon = two_livekit_clusters
    placement = Placement.objects.create(
        room_name="my-room", cluster="lyon", sid="RM_recorded"
    )

    with caplog.at_level(logging.INFO, logger="core.livekit.placements"):
        assert PlacementService.record_started(lyon, started()) is True

    assert_placement_unchanged(placement)
    assert not room_management.mock_calls
    assert (
        "LiveKit room my-room started on LiveKit cluster lyon with SID RM_started, "
        "while placed there with SID RM_recorded: keeping its placement"
    ) in caplog.text


@pytest.mark.parametrize("registered", (True, False))
def test_record_started_without_placement(
    registered,
    two_livekit_clusters,
    room_management,
    caplog,
    django_assert_num_queries,
):
    """
    A LiveKit room started without placement on a cluster that may receive new
    placements is placed there, without asking the placement strategy, with
    its SID and the room it is named after, if any.
    """
    _paris, lyon = two_livekit_clusters
    room = RoomFactory() if registered else None
    room_name = str(room.id) if registered else "my-room"
    livekit_room_started = livekit_room("RM_started", name=room_name)

    with (
        mock.patch.object(WeightedRandomStrategy, "choose") as choose,
        caplog.at_level(logging.INFO, logger="core.livekit.placements"),
        django_assert_num_queries(3),
    ):
        started_on_lyon = PlacementService.record_started(
            lyon, livekit_room_started, room
        )

    assert started_on_lyon is True
    choose.assert_not_called()
    placement = Placement.objects.get()
    assert placement.room_name == room_name
    assert placement.room == room
    assert placement.cluster == "lyon"
    assert placement.sid == "RM_started"
    assert placement.epoch == 0
    assert not room_management.mock_calls
    assert (
        f"LiveKit room {room_name} started on LiveKit cluster lyon with SID "
        "RM_started without placement: placing it there"
    ) in caplog.text


def test_record_started_without_placement_concurrently(
    two_livekit_clusters, room_management
):
    """
    A LiveKit room started without placement, placed on another cluster while
    it is placed on its own, is closed there.
    """
    _paris, lyon = two_livekit_clusters
    bulk_create = Placement.objects.bulk_create

    def placed_meanwhile(objs, **kwargs):
        Placement.objects.create(room_name=objs[0].room_name, cluster="paris")
        return bulk_create(objs, **kwargs)

    with mock.patch.object(
        Placement.objects, "bulk_create", side_effect=placed_meanwhile
    ):
        assert PlacementService.record_started(lyon, started()) is False

    assert room_management.mock_calls == closing_calls(lyon)
    placement = Placement.objects.get()
    assert placement.cluster == "paris"
    assert placement.sid == ""


def test_record_started_on_cluster_weighing_zero(
    settings, room_management, audit_events, caplog
):
    """
    A LiveKit room started without placement on a cluster that may not receive
    new placements is closed there, by the system, and not placed: the meeting
    its participants were in had ended.
    """
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon", weight=0)]
    )
    _paris, lyon = get_livekit_clusters()

    with caplog.at_level(logging.WARNING, logger="core.livekit.placements"):
        assert PlacementService.record_started(lyon, started()) is False

    assert not Placement.objects.exists()
    assert room_management.mock_calls == closing_calls(lyon)
    [closed] = find_events(audit_events, "livekit.room.close")
    assert closed["lasuite"]["outcome"] == "success"
    assert closed["lasuite"]["actor"] == {"type": "system"}
    assert closed["lasuite"]["details"] == {"cluster": "lyon"}
    assert (
        "LiveKit room my-room started without placement on LiveKit cluster lyon, "
        "which may not receive new placements: closing it"
    ) in caplog.text


def test_record_started_without_candidate(settings, room_management, caplog):
    """
    A LiveKit room started without placement while no cluster may receive new
    placements is left alone, and not placed.
    """
    settings.LIVEKIT_CLUSTERS = json.dumps([livekit_cluster_entry("paris", weight=0)])
    (paris,) = get_livekit_clusters()

    with caplog.at_level(logging.WARNING, logger="core.livekit.placements"):
        assert PlacementService.record_started(paris, started()) is True

    assert not Placement.objects.exists()
    assert not room_management.mock_calls
    assert (
        "LiveKit room my-room started on LiveKit cluster paris without placement, "
        "while no LiveKit cluster may receive new placements: leaving it alone"
    ) in caplog.text


@pytest.mark.usefixtures("two_livekit_clusters")
@pytest.mark.parametrize("sid", ("RM_placed", ""))
def test_record_started_elsewhere_than_placed(
    sid, room_management, audit_events, caplog, django_assert_num_queries
):
    """
    A LiveKit room started on a cluster other than its placement's, as one
    revived on the cluster its room was relocated from, is closed there by the
    system, its placement read again right before. The placement is left as
    it is.
    """
    _paris, lyon = get_livekit_clusters()
    placement = Placement.objects.create(room_name="my-room", cluster="paris", sid=sid)

    with (
        caplog.at_level(logging.WARNING, logger="core.livekit.placements"),
        django_assert_num_queries(2),
    ):
        assert PlacementService.record_started(lyon, started()) is False

    assert room_management.mock_calls == closing_calls(lyon)
    assert_placement_unchanged(placement)
    [closed] = find_events(audit_events, "livekit.room.close")
    assert closed["lasuite"]["outcome"] == "success"
    assert closed["lasuite"]["actor"] == {"type": "system"}
    assert closed["lasuite"]["details"] == {"cluster": "lyon"}
    assert (
        "LiveKit room my-room started on LiveKit cluster lyon, but is placed on "
        "LiveKit cluster paris: closing it"
    ) in caplog.text


def test_record_started_moved_to_its_cluster_meanwhile(
    two_livekit_clusters, room_management
):
    """
    A LiveKit room started on a cluster other than its placement's is not
    closed when the placement read again right before closing it moved to
    that cluster: it is recorded there.
    """
    _paris, lyon = two_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="paris", sid="RM_placed")

    def relocate_to_lyon():
        Placement.objects.filter(room_name="my-room").update(
            cluster="lyon", previous_cluster="paris", sid="", epoch=F("epoch") + 1
        )

    with changing_after_reads(relocate_to_lyon):
        assert PlacementService.record_started(lyon, started()) is True

    assert not room_management.mock_calls
    placement = Placement.objects.get()
    assert placement.cluster == "lyon"
    assert placement.sid == "RM_started"
    assert placement.epoch == 1


def test_record_started_elsewhere_not_live(
    two_livekit_clusters, room_management, audit_events
):
    """
    A LiveKit room started on a cluster other than its placement's, and no
    longer live there, is left alone, which is not audited.
    """
    _paris, lyon = two_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="paris", sid="RM_placed")
    room_management.delete_room.side_effect = RoomNotFoundException(
        "Room does not exist"
    )

    assert PlacementService.record_started(lyon, started()) is False

    assert room_management.mock_calls == closing_calls(lyon)
    assert not audit_events


@pytest.mark.parametrize(
    "error",
    (
        pytest.param(
            aiohttp.ClientConnectionError("Connection refused"), id="unreachable"
        ),
        pytest.param(
            RoomManagementException("Could not delete room"), id="deletion-failure"
        ),
    ),
)
def test_record_started_elsewhere_close_failure(
    error, two_livekit_clusters, room_management, audit_events
):
    """
    A cluster failing to close a LiveKit room started on it rather than on its
    placement's cluster raises, which is audited: LiveKit sends the event
    again.
    """
    _paris, lyon = two_livekit_clusters
    placement = Placement.objects.create(
        room_name="my-room", cluster="paris", sid="RM_placed"
    )
    room_management.delete_room.side_effect = error

    with pytest.raises(LiveKitRoomCloseError):
        PlacementService.record_started(lyon, started())

    assert room_management.mock_calls == closing_calls(lyon)
    assert_placement_unchanged(placement)
    [closed] = find_events(audit_events, "livekit.room.close")
    assert closed["lasuite"]["outcome"] == "failure"
    assert closed["lasuite"]["details"] == {"cluster": "lyon"}


def test_record_started_on_unregistered_cluster(
    two_livekit_clusters, room_management, caplog
):
    """
    A LiveKit room placed on a cluster this process does not know is left
    alone, and so is its placement, which a webhook never deletes: processes
    may disagree on the clusters while their registry changes.
    """
    _paris, lyon = two_livekit_clusters
    placement = Placement.objects.create(
        room_name="my-room", cluster="lille", sid="RM_placed"
    )

    with caplog.at_level(logging.WARNING, logger="core.livekit.placements"):
        assert PlacementService.record_started(lyon, started()) is False

    assert_placement_unchanged(placement)
    assert not room_management.mock_calls
    assert (
        "LiveKit room my-room started on LiveKit cluster lyon, but is placed on "
        "LiveKit cluster lille, which is not registered: leaving both alone"
    ) in caplog.text


@pytest.mark.parametrize(
    "sid",
    (
        pytest.param("RM_started", id="recorded-by-a-join"),
        pytest.param("RM_created_again", id="created-again"),
    ),
)
def test_record_started_changed_meanwhile(
    sid, two_livekit_clusters, room_management, django_assert_num_queries
):
    """
    A placement whose SID changed while a LiveKit room started on its cluster
    is recorded is read again, rather than overwritten.
    """
    _paris, lyon = two_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="lyon")

    def change():
        Placement.objects.filter(room_name="my-room").update(sid=sid)

    placement_read = 1
    change_meanwhile = 1
    sid_update = 1
    with (
        changing_after_reads(change),
        django_assert_num_queries(
            placement_read + change_meanwhile + sid_update + placement_read
        ),
    ):
        assert PlacementService.record_started(lyon, started()) is True

    assert Placement.objects.get().sid == sid
    assert not room_management.mock_calls


def test_record_started_keeps_changing(two_livekit_clusters, caplog):
    """
    A placement that keeps changing while a LiveKit room started on its
    cluster is recorded is left as it is, which raises.
    """
    _paris, lyon = two_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="lyon")

    with (
        changing_after_reads(lambda: bump_epoch("my-room"), every=True),
        caplog.at_level(logging.WARNING, logger="core.livekit.placements"),
        pytest.raises(PlacementChangedError, match="kept changing"),
    ):
        PlacementService.record_started(lyon, started())

    placement = Placement.objects.get()
    assert placement.epoch == PLACEMENT_CREATION_ATTEMPTS
    assert placement.sid == ""
    assert (
        "Placement of LiveKit room my-room kept changing while its LiveKit room "
        "started on LiveKit cluster lyon was recorded"
    ) in caplog.text


def test_record_started_without_sid(
    two_livekit_clusters, room_management, django_assert_num_queries
):
    """A LiveKit room told without SID is taken for the LiveKit room its room is
    placed on, and nothing is recorded."""
    _paris, lyon = two_livekit_clusters

    with django_assert_num_queries(0):
        assert PlacementService.record_started(lyon, started("")) is True

    assert not Placement.objects.exists()
    assert not room_management.mock_calls


@pytest.mark.parametrize("registered", (True, False))
def test_relocate(registered, three_livekit_clusters, room_management, caplog):
    """A room is relocated to the cluster the placement strategy picks among the
    candidates other than its own. Its placement moves there, with no SID until
    the next join creates the LiveKit room there, records the cluster it left
    and gets a new epoch. The LiveKit room is then deleted on the cluster it
    left, never on the new one."""
    paris, lyon, marseille = three_livekit_clusters
    room = RoomFactory() if registered else None
    room_name = str(room.id) if registered else "my-room"
    placement = Placement.objects.create(
        room_name=room_name,
        room=room,
        cluster="paris",
        sid="RM_old",
        epoch=2,
        absent_since=timezone.now(),
    )

    with (
        picking(marseille) as choose,
        caplog.at_level(logging.INFO, logger="core.livekit.placements"),
    ):
        cluster = PlacementService.relocate(room_name, actor=None)

    assert cluster == marseille
    choose.assert_called_once_with(
        mock.ANY, (lyon, marseille), PlacementContext(room_name=room_name, room=room)
    )
    relocated = Placement.objects.get()
    assert relocated.pk == placement.pk
    assert relocated.cluster == "marseille"
    assert relocated.previous_cluster == "paris"
    assert relocated.sid == ""
    assert relocated.absent_since is None
    assert relocated.epoch == 3
    assert relocated.relocated_at > placement.updated_at
    assert relocated.updated_at == relocated.relocated_at
    assert room_management.mock_calls == closing_calls(paris, room_name)
    assert (
        f"Relocated LiveKit room {room_name} from LiveKit cluster paris to LiveKit "
        "cluster marseille"
    ) in caplog.text
    assert f"Closed LiveKit room {room_name} on LiveKit cluster paris" in caplog.text


def test_relocate_to(three_livekit_clusters, room_management):
    """A room is relocated to the candidate named, without asking the placement
    strategy."""
    paris, lyon, _marseille = three_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="paris")

    with mock.patch.object(WeightedRandomStrategy, "choose") as choose:
        assert PlacementService.relocate("my-room", "lyon", actor=None) == lyon

    choose.assert_not_called()
    placement = Placement.objects.get()
    assert placement.cluster == "lyon"
    assert placement.previous_cluster == "paris"
    assert placement.epoch == 1
    assert room_management.mock_calls == closing_calls(paris)


def test_relocate_from_cluster_weighing_zero(settings, room_management):
    """A room placed on a cluster that receives no new placements is relocated
    to another."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry("paris", weight=0), livekit_cluster_entry("lyon")]
    )
    paris, lyon = get_livekit_clusters()
    Placement.objects.create(room_name="my-room", cluster="paris")

    assert PlacementService.relocate("my-room", actor=None) == lyon

    assert Placement.objects.get().cluster == "lyon"
    assert room_management.mock_calls == closing_calls(paris)


@pytest.mark.parametrize(
    ("to", "message"),
    (
        pytest.param(
            "paris",
            "LiveKit room my-room is placed on LiveKit cluster paris already",
            id="its-cluster",
        ),
        pytest.param("lille", "No LiveKit cluster is named 'lille'", id="unregistered"),
        pytest.param(
            "marseille",
            "LiveKit cluster marseille may not receive new placements",
            id="not-a-candidate",
        ),
    ),
)
def test_relocate_to_refused(to, message, settings, room_management, audit_events):
    """A room is not relocated to its own cluster, to a cluster that is not
    registered or to one that may not receive new placements: nothing changes."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry("paris"),
            livekit_cluster_entry("lyon"),
            livekit_cluster_entry("marseille", weight=0),
        ]
    )
    placement = Placement.objects.create(
        room_name="my-room", cluster="paris", sid="RM_abc"
    )

    with pytest.raises(RelocationRefusedError, match=message):
        PlacementService.relocate("my-room", to, actor=None)

    assert_placement_unchanged(placement)
    assert not room_management.mock_calls
    assert not audit_events


@pytest.mark.parametrize(
    ("clusters", "placed_on"),
    (
        pytest.param(None, "default", id="single-cluster"),
        pytest.param(
            [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon", weight=0)],
            "paris",
            id="other-weighing-zero",
        ),
    ),
)
def test_relocate_without_other_candidate(
    clusters, placed_on, settings, room_management
):
    """A room is not relocated while no other cluster may receive new
    placements: nothing changes."""
    settings.LIVEKIT_CLUSTERS = json.dumps(clusters) if clusters else None
    placement = Placement.objects.create(room_name="my-room", cluster=placed_on)

    with pytest.raises(
        RelocationRefusedError,
        match=(
            f"No LiveKit cluster other than {placed_on} may receive LiveKit room "
            "my-room"
        ),
    ):
        PlacementService.relocate("my-room", actor=None)

    assert_placement_unchanged(placement)
    assert not room_management.mock_calls


@pytest.mark.usefixtures("two_livekit_clusters")
def test_relocate_not_placed(room_management):
    """A room whose LiveKit room is not placed is not relocated."""
    Placement.objects.create(room_name="other-room", cluster="paris")

    with pytest.raises(
        RelocationRefusedError, match="LiveKit room my-room is not placed"
    ):
        PlacementService.relocate("my-room", actor=None)

    assert Placement.objects.get().room_name == "other-room"
    assert not room_management.mock_calls


@pytest.mark.usefixtures("two_livekit_clusters")
def test_relocate_from_unregistered_cluster(room_management):
    """A room placed on a cluster that is not registered is not relocated: its
    participants could not be told."""
    placement = Placement.objects.create(
        room_name="my-room", cluster="lille", sid="RM_abc"
    )

    with pytest.raises(
        RelocationRefusedError,
        match=(
            "LiveKit room my-room is placed on LiveKit cluster lille, which is not "
            "registered"
        ),
    ):
        PlacementService.relocate("my-room", actor=None)

    assert_placement_unchanged(placement)
    assert not room_management.mock_calls


@pytest.mark.parametrize("registered", (True, False))
@pytest.mark.usefixtures("two_livekit_clusters", "room_management")
def test_relocate_is_audited(registered, audit_events):
    """A relocation is audited with the LiveKit room of the room relocated, as
    the other events of its placement are, whether the room is registered or
    not, the clusters it moved between and a relocation id. The closing of the
    LiveKit room it left is audited too, with the same relocation id. Both are
    audited as done by the actor given: here, a user acting through the
    admin."""
    user = UserFactory(is_staff=True)
    room = RoomFactory() if registered else None
    room_name = str(room.id) if registered else "my-room"
    Placement.objects.create(room_name=room_name, room=room, cluster="paris")

    PlacementService.relocate(room_name, "lyon", actor=user)

    [relocated] = find_events(audit_events, "livekit.placement.relocate")
    relocation_id = relocated["lasuite"]["details"]["relocation_id"]
    assert str(uuid.UUID(relocation_id)) == relocation_id
    assert relocated["event"]["category"] == ["api"]
    assert relocated["event"]["type"] == ["change"]
    assert relocated["lasuite"]["outcome"] == "success"
    assert relocated["lasuite"]["actor"]["type"] == "user"
    assert relocated["user"]["id"] == str(user.id)
    assert relocated["entity"]["target"] == {
        "id": room_name,
        "sub_type": "livekit_room",
    }
    assert relocated["lasuite"]["details"] == {
        "source_cluster": "paris",
        "target_cluster": "lyon",
        "relocation_id": relocation_id,
    }

    [closed] = find_events(audit_events, "livekit.room.close")
    assert closed["event"]["type"] == ["end"]
    assert closed["lasuite"]["outcome"] == "success"
    assert closed["lasuite"]["actor"]["type"] == "user"
    assert closed["user"]["id"] == str(user.id)
    assert closed["service"]["target"] == {"name": "livekit"}
    assert closed["entity"]["target"] == {"id": room_name, "sub_type": "livekit_room"}
    assert closed["lasuite"]["details"] == {
        "cluster": "paris",
        "relocation_id": relocation_id,
    }


@pytest.mark.usefixtures("two_livekit_clusters", "room_management")
def test_relocate_by_the_system(audit_events):
    """A relocation by no user, such as a drain's, is audited as done by the
    system, as is the closing of the LiveKit room it left."""
    Placement.objects.create(room_name="my-room", cluster="paris")

    PlacementService.relocate("my-room", actor=None)

    assert [event["event"]["action"] for event in audit_events] == [
        "livekit.placement.relocate",
        "livekit.room.close",
    ]
    for event in audit_events:
        assert event["lasuite"]["actor"] == {"type": "system"}
        assert "user" not in event


def test_relocate_source_unreachable(
    two_livekit_clusters, room_management, audit_events, caplog
):
    """A room is relocated even when the cluster it leaves cannot be reached to
    close the LiveKit room there, which is logged and audited."""
    _paris, lyon = two_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="paris")
    room_management.delete_room.side_effect = aiohttp.ClientConnectionError(
        "Connection refused"
    )

    with caplog.at_level(logging.ERROR, logger="core.livekit.placements"):
        assert PlacementService.relocate("my-room", actor=None) == lyon

    placement = Placement.objects.get()
    assert placement.cluster == "lyon"
    assert placement.previous_cluster == "paris"
    assert placement.epoch == 1
    assert "LiveKit cluster paris failed to close LiveKit room my-room" in caplog.text
    [relocated] = find_events(audit_events, "livekit.placement.relocate")
    assert relocated["lasuite"]["outcome"] == "success"
    [closed] = find_events(audit_events, "livekit.room.close")
    assert closed["lasuite"]["outcome"] == "failure"
    assert closed["lasuite"]["details"] == {
        "cluster": "paris",
        "relocation_id": relocated["lasuite"]["details"]["relocation_id"],
    }


def bump_epoch(room_name):
    """Change the placement of a LiveKit room, which stays on its cluster."""
    Placement.objects.filter(room_name=room_name).update(epoch=F("epoch") + 1)


def place_again(room_name):
    """Place a LiveKit room again on its cluster, as once it finished and was
    joined anew."""
    cluster = Placement.objects.get(room_name=room_name).cluster
    Placement.objects.filter(room_name=room_name).delete()
    Placement.objects.create(room_name=room_name, cluster=cluster, sid="RM_new")


def finish(room_name):
    """Delete the placement of a LiveKit room, as once it finished."""
    Placement.objects.filter(room_name=room_name).delete()


def move_to_lyon(room_name):
    """Move the placement of a LiveKit room to lyon, keeping its epoch."""
    Placement.objects.filter(room_name=room_name).update(cluster="lyon")


PLACEMENT_FIELDS = ("pk", "cluster", "sid", "epoch", "previous_cluster", "updated_at")


@pytest.mark.parametrize("change", (bump_epoch, place_again, finish, move_to_lyon))
def test_relocate_changed_meanwhile(
    change, three_livekit_clusters, room_management, audit_events
):
    """A relocation reads the placement once: one that changed before it moves
    is left as the change made it, and the relocation is refused, for the
    caller to ask again. That holds whether the placement stayed on its
    cluster, as one whose LiveKit room finished and was placed again there, or
    left it."""
    _paris, _lyon, marseille = three_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="paris")
    changed = []

    def change_placement(room_name):
        change(room_name)
        changed.extend(Placement.objects.values(*PLACEMENT_FIELDS))

    with (
        choosing_while_changed(marseille, change_placement) as choose,
        pytest.raises(
            RelocationRefusedError,
            match="The placement of LiveKit room my-room changed meanwhile",
        ),
    ):
        PlacementService.relocate("my-room", actor=None)

    choose.assert_called_once()
    assert list(Placement.objects.values(*PLACEMENT_FIELDS)) == changed
    assert not room_management.mock_calls
    assert not audit_events


def test_relocate_concurrently(three_livekit_clusters, room_management):
    """A room relocated by another request while it is relocated moves once:
    the relocation moving its placement last is refused, rather than moving
    the room again."""
    paris, _lyon, marseille = three_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="paris")

    def relocate_to_lyon(room_name):
        PlacementService.relocate(room_name, "lyon", actor=None)

    with (
        choosing_while_changed(marseille, relocate_to_lyon) as choose,
        pytest.raises(
            RelocationRefusedError,
            match="The placement of LiveKit room my-room changed meanwhile",
        ),
    ):
        PlacementService.relocate("my-room", actor=None)

    choose.assert_called_once()
    placement = Placement.objects.get()
    assert placement.cluster == "lyon"
    assert placement.previous_cluster == "paris"
    assert placement.epoch == 1
    assert room_management.mock_calls == closing_calls(paris)


def test_close_stray_room(two_livekit_clusters, room_management, audit_events, caplog):
    """A LiveKit room live on a cluster it is not placed on is closed there: it
    is deleted, with no relocation id, neither announced nor audited. Its
    placement is left as it is."""
    _paris, lyon = two_livekit_clusters
    placement = Placement.objects.create(
        room_name="my-room", cluster="paris", sid="RM_abc"
    )

    with caplog.at_level(logging.INFO, logger="core.livekit.placements"):
        closed = [
            PlacementService.close_stray_room(lyon, "my-room", actor=None)
            for _call in range(2)
        ]

    assert closed == [True, True]
    assert room_management.mock_calls == closing_calls(lyon) * 2
    assert_placement_unchanged(placement)
    assert "Closed LiveKit room my-room on LiveKit cluster lyon" in caplog.text
    events = find_events(audit_events, "livekit.room.close")
    assert [event["lasuite"]["details"] for event in events] == [
        {"cluster": "lyon"},
        {"cluster": "lyon"},
    ]
    for event in events:
        assert event["lasuite"]["outcome"] == "success"
        assert event["lasuite"]["actor"] == {"type": "system"}
        assert event["entity"]["target"] == {
            "id": "my-room",
            "sub_type": "livekit_room",
        }
    assert not find_events(audit_events, "livekit.placement.relocate")


def test_close_stray_room_not_live(room_management, audit_events, caplog):
    """A LiveKit room that is not live on the cluster is left alone, which is
    not audited."""
    cluster = get_default_livekit_cluster()
    room_management.delete_room.side_effect = RoomNotFoundException(
        "Room does not exist"
    )

    with caplog.at_level(logging.INFO, logger="core.livekit.placements"):
        closed = PlacementService.close_stray_room(cluster, "my-room", actor=None)

    assert closed is False
    assert room_management.mock_calls == closing_calls(cluster)
    assert (
        "LiveKit room my-room is not live on LiveKit cluster default: nothing to close"
    ) in caplog.text
    assert not audit_events


@pytest.mark.parametrize(
    "error",
    (
        pytest.param(
            aiohttp.ClientConnectionError("Connection refused"), id="unreachable"
        ),
        pytest.param(
            RoomManagementException("Could not delete room"), id="deletion-failure"
        ),
    ),
)
def test_close_stray_room_failure(error, room_management, audit_events, caplog):
    """A cluster failing to close a LiveKit room is logged and audited, and
    told apart from a LiveKit room that is not live there: it raises."""
    cluster = get_default_livekit_cluster()
    room_management.delete_room.side_effect = error

    with (
        caplog.at_level(logging.ERROR, logger="core.livekit.placements"),
        pytest.raises(LiveKitRoomCloseError) as raised,
    ):
        PlacementService.close_stray_room(cluster, "my-room", actor=None)

    assert raised.value.__cause__ is error
    assert room_management.mock_calls == closing_calls(cluster)
    [record] = [
        record for record in caplog.records if record.name == "core.livekit.placements"
    ]
    assert record.getMessage() == (
        "LiveKit cluster default failed to close LiveKit room my-room"
    )
    assert record.exc_info[1] is error
    [event] = find_events(audit_events, "livekit.room.close")
    assert event["lasuite"]["outcome"] == "failure"
    assert event["event"]["reason"] == "internal_error"
    assert event["error"] == {
        "type": f"{type(error).__module__}.{type(error).__qualname__}"
    }
    assert event["log"]["level"] == "error"
    assert event["lasuite"]["details"] == {"cluster": "default"}
