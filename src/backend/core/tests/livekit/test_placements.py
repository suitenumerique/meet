"""Unit tests for the placements of LiveKit rooms on the LiveKit clusters."""

import json
import logging
from unittest import mock

from django.db.models import F
from django.utils import timezone

import pytest

from core.factories import RoomFactory
from core.livekit.clusters import get_default_livekit_cluster
from core.livekit.exceptions import (
    LiveKitRoomCreationError,
    NoCandidateLiveKitClusterError,
    PlacementChangedError,
)
from core.livekit.placements import (
    PLACEMENT_UPDATE_ATTEMPTS,
    PlacementService,
)
from core.livekit.strategies import PlacementContext, WeightedRandomStrategy
from core.models import Placement
from core.tests.utils import (
    CREATED_LIVEKIT_ROOM_SID,
    livekit_cluster_entry,
    livekit_room,
)

pytestmark = pytest.mark.django_db


def picking(cluster):
    """Patch the default placement strategy to pick a cluster."""
    return mock.patch.object(
        WeightedRandomStrategy, "choose", autospec=True, return_value=cluster
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


@pytest.mark.parametrize("registered", (True, False))
def test_place_new_room(
    registered, two_livekit_clusters, fake_livekit_room_creation, caplog
):
    """
    A LiveKit room without placement is placed on the cluster the placement
    strategy picks
    """
    paris, lyon = two_livekit_clusters
    room = RoomFactory() if registered else None
    room_name = str(room.id) if registered else "my-room"
    fake_livekit_room_creation.return_value = livekit_room("RM_new")

    with (
        picking(lyon) as choose,
        caplog.at_level(logging.INFO, logger="core.livekit.placements"),
    ):
        cluster = PlacementService.place(room_name, room)

    assert cluster == lyon
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
        cluster = PlacementService.place(str(room.id), room)

    assert cluster == lyon
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

    with picking(lyon) as choose:
        clusters = [PlacementService.place("my-room") for _call in range(2)]

    assert clusters == [lyon, lyon]
    choose.assert_called_once()
    assert (
        fake_livekit_room_creation.call_args_list
        == [mock.call("my-room", cluster=lyon)] * 2
    )
    assert Placement.objects.get().cluster == "lyon"


def test_place_on_cluster_weighing_zero(settings, fake_livekit_room_creation):
    """
    A LiveKit room placed on a cluster that receives no new placements stays
    there.
    """
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon", weight=0)]
    )
    Placement.objects.create(room_name="my-room", cluster="lyon")

    assert PlacementService.place("my-room").name == "lyon"
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
    picks = iter((paris, lyon))
    concurrent_clusters = []

    def choose(_strategy, _candidates, context):
        pick = next(picks)
        if pick == paris:
            concurrent_clusters.append(PlacementService.place(context.room_name))
        return pick

    with mock.patch.object(
        WeightedRandomStrategy, "choose", autospec=True, side_effect=choose
    ):
        cluster = PlacementService.place("my-room")

    assert cluster == lyon
    assert concurrent_clusters == [lyon]

    placement = Placement.objects.get()

    assert placement.cluster == "lyon"
    assert placement.sid == CREATED_LIVEKIT_ROOM_SID
    assert (
        fake_livekit_room_creation.call_args_list
        == [mock.call("my-room", cluster=lyon)] * 2
    )


def test_place_placed_meanwhile_creation_failure(
    two_livekit_clusters, fake_livekit_room_creation
):
    """
    A concurrent placement should stay when there is a LiveKit API error
    """
    paris, lyon = two_livekit_clusters
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
        PlacementService.place("my-room")

    fake_livekit_room_creation.assert_called_once_with("my-room", cluster=paris)
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
    fake_livekit_room_creation.side_effect = LiveKitRoomCreationError("Timed out")

    with (
        picking(lyon),
        caplog.at_level(logging.INFO, logger="core.livekit.placements"),
        pytest.raises(LiveKitRoomCreationError, match="Timed out"),
    ):
        PlacementService.place("my-room")

    fake_livekit_room_creation.assert_called_once_with("my-room", cluster=lyon)
    assert not Placement.objects.exists()
    assert (
        "Deleted the placement of LiveKit room my-room on LiveKit cluster lyon, "
        "which failed to create it"
    ) in caplog.text

    fake_livekit_room_creation.side_effect = None
    with picking(paris):
        assert PlacementService.place("my-room") == paris
    assert Placement.objects.get().cluster == "paris"


@pytest.mark.usefixtures("two_livekit_clusters")
@pytest.mark.parametrize("sid", ("", "RM_old"))
def test_place_placed_room_creation_failure(sid, fake_livekit_room_creation):
    """
    The placement of a LiveKit room placed earlier stays when its cluster
    fails to create the LiveKit room.
    """
    placement = Placement.objects.create(room_name="my-room", cluster="lyon", sid=sid)
    fake_livekit_room_creation.side_effect = LiveKitRoomCreationError("Timed out")

    with pytest.raises(LiveKitRoomCreationError):
        PlacementService.place("my-room")

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
    two_livekit_clusters,
    fake_livekit_room_creation,
):
    """
    A placement that changed while its cluster created the LiveKit room is
    read again, and the LiveKit room created once more where it now says, or
    placed again when it is gone.
    """
    paris, lyon = two_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="lyon")
    fake_livekit_room_creation.side_effect = change_during_first_creation(**changes)

    with picking(paris):
        cluster = PlacementService.place("my-room")

    assert cluster.name == expected_cluster
    assert fake_livekit_room_creation.call_args_list == [
        mock.call("my-room", cluster=lyon),
        mock.call("my-room", cluster=cluster),
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
    Placement.objects.create(room_name="my-room", cluster="lyon", sid=sid)
    fake_livekit_room_creation.side_effect = change_during_first_creation(
        sid="RM_first", absent_since=timezone.now() if absent else None
    )

    placement_read = 1
    change_meanwhile = 1
    sid_update = 1
    with django_assert_num_queries(placement_read + change_meanwhile + sid_update):
        cluster = PlacementService.place("my-room")

    assert cluster == lyon
    fake_livekit_room_creation.assert_called_once_with("my-room", cluster=lyon)

    placement = Placement.objects.get()
    assert placement.cluster == "lyon"
    assert placement.epoch == 0
    assert placement.sid == "RM_first"
    assert placement.absent_since is None


def test_place_keeps_changing(two_livekit_clusters, fake_livekit_room_creation, caplog):
    """
    A placement that changes again while its cluster creates the LiveKit room
    once more is left as it is.
    """
    _paris, lyon = two_livekit_clusters
    Placement.objects.create(room_name="my-room", cluster="lyon")

    def bump_epoch_each_time(room_name, **_kwargs):
        Placement.objects.filter(room_name=room_name).update(epoch=F("epoch") + 1)
        return livekit_room("RM_new")

    fake_livekit_room_creation.side_effect = bump_epoch_each_time

    with (
        caplog.at_level(logging.WARNING, logger="core.livekit.placements"),
        pytest.raises(PlacementChangedError, match="kept changing"),
    ):
        PlacementService.place("my-room")

    assert (
        fake_livekit_room_creation.call_args_list
        == [mock.call("my-room", cluster=lyon)] * PLACEMENT_UPDATE_ATTEMPTS
    )
    placement = Placement.objects.get()
    assert placement.epoch == PLACEMENT_UPDATE_ATTEMPTS
    assert placement.sid == ""
    assert (
        "Placement of LiveKit room my-room kept changing while its LiveKit room "
        "was created"
    ) in caplog.text


def test_place_on_unregistered_cluster(
    two_livekit_clusters, fake_livekit_room_creation, caplog
):
    """
    A LiveKit room placed on a cluster since removed from the registry is
    placed again, with a warning.
    """
    _paris, lyon = two_livekit_clusters
    unregistered = Placement.objects.create(
        room_name="my-room", cluster="lille", sid="RM_old"
    )

    with (
        picking(lyon),
        caplog.at_level(logging.WARNING, logger="core.livekit.placements"),
    ):
        assert PlacementService.place("my-room") == lyon

    placement = Placement.objects.get()
    assert placement.pk != unregistered.pk
    assert placement.cluster == "lyon"
    assert placement.sid == CREATED_LIVEKIT_ROOM_SID
    fake_livekit_room_creation.assert_called_once_with("my-room", cluster=lyon)
    assert (
        "LiveKit room my-room is placed on LiveKit cluster lille, which is not "
        "registered: placing it again"
    ) in caplog.text


def test_place_without_candidate(settings, fake_livekit_room_creation):
    """
    A LiveKit room cannot be placed while no cluster may receive new
    placements.
    """
    settings.LIVEKIT_CLUSTERS = json.dumps([livekit_cluster_entry("paris", weight=0)])

    with pytest.raises(NoCandidateLiveKitClusterError):
        PlacementService.place("my-room")

    assert not Placement.objects.exists()
    fake_livekit_room_creation.assert_not_called()
