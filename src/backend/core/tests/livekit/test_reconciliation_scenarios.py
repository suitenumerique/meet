"""Scenarios following a room through its joins, the webhooks of its LiveKit
rooms that were lost, and the reconciliations that make up for them, on
LiveKit clusters a FakeLiveKitClusters stands for."""

import json
from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.utils import timezone

import pytest
from freezegun import freeze_time
from rest_framework.test import APIClient

from core.factories import RoomFactory
from core.livekit.clusters import get_livekit_clusters
from core.livekit.reconciliation import absence_grace
from core.models import Placement, RoomAccessLevel
from core.services.lobby import LobbyService
from core.services.sip_management import SIPManagement
from core.tests.utils import livekit_cluster_entry, random_remote_addr

pytestmark = [pytest.mark.django_db, pytest.mark.real_livekit_room_creation]


@pytest.fixture(name="livekit")
def livekit_fixture(fake_livekit_clusters, settings):
    """Register the Paris and Lyon LiveKit clusters, place new rooms on Lyon,
    and return what stands for their room services. Telephony and roomkit are
    disabled, as several clusters need."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon")]
    )
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    with mock.patch("core.livekit.strategies.SystemRandom.random", return_value=0.75):
        yield fake_livekit_clusters


@pytest.fixture(name="lobby_clearings")
def lobby_clearings_fixture():
    """Mock the clearing of the lobby of a room, the part of its cleanup that
    makes the participants admitted from its lobby wait there anew."""
    with mock.patch.object(LobbyService, "clear_room_cache") as clear_room_cache:
        yield clear_room_cache


def join(room, **data):
    """Join a room as an anonymous participant, and return the name of the
    cluster and the SID of the LiveKit room its credentials are for."""
    response = APIClient(REMOTE_ADDR=random_remote_addr()).post(
        f"/api/v1.0/rooms/{room.id!s}/join/", data, format="json"
    )
    assert response.status_code == 200
    credentials = response.json()["livekit"]
    [cluster] = [
        cluster
        for cluster in get_livekit_clusters()
        if cluster.url == credentials["url"]
    ]
    return cluster.name, credentials["room_sid"]


def reconcile():
    """Run the reconciliation as its job does, and return its summary line."""
    out = StringIO()
    call_command("reconcile_livekit_placements", stdout=out)
    return out.getvalue()


def placed(room):
    """Return the cluster, SID and absence of the placement of a room, None
    without placement."""
    return (
        Placement.objects.filter(room_name=str(room.id))
        .values_list("cluster", "sid", "absent_since")
        .first()
    )


def test_lost_room_finished_cleaned_up(livekit, lobby_clearings):
    """A room whose room_finished was lost keeps its placement until a
    reconciliation finds its LiveKit room missing: it is marked absent, then
    deleted once absent for absence_grace(), and the room is cleaned up, its
    lobby admissions with it. A participant reporting its LiveKit room missing
    then has it placed and created again."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    name = str(room.id)
    cluster_name, sid = join(room)
    assert cluster_name == "lyon"
    assert placed(room) == ("lyon", sid, None)
    assert join(room, ensure_room=False) == ("lyon", sid)

    livekit.finish("lyon", name)

    with freeze_time(timezone.now() + timedelta(minutes=1)) as clock:
        assert "1 marked absent," in reconcile()
        marked_at = timezone.now()
        assert placed(room) == ("lyon", sid, marked_at)
        lobby_clearings.assert_not_called()

        clock.tick(timedelta(seconds=absence_grace() - 1))
        assert "0 marked absent, 0 live again, 0 deleted," in reconcile()
        assert placed(room) == ("lyon", sid, marked_at)

        clock.tick(timedelta(seconds=1))
        assert "1 deleted," in reconcile()

    assert placed(room) is None
    lobby_clearings.assert_called_once_with(room.id)

    rejoined = join(room, ensure_room=False, failure="missing", failed_room_sid=sid)

    assert rejoined[0] == "lyon"
    assert rejoined[1] != sid
    assert placed(room) == ("lyon", rejoined[1], None)
    assert list(livekit.rooms["lyon"]) == [name]


def test_lost_room_started_adopted(fake_livekit_clusters, settings):
    """A LiveKit room live without placement, as when its room_started was
    lost, is adopted by a reconciliation, then its room is recorded as
    started, and its SIP dispatch rule ensured. Joins that trust LiveKit rooms
    known to be live are then answered its SID, and the next reconciliation
    records no start again."""
    settings.ROOM_TELEPHONY_ENABLED = True
    livekit = fake_livekit_clusters
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    livekit.live("default", str(room.id), "RM_started", num_participants=1)

    with mock.patch.object(SIPManagement, "ensure_dispatch_rule") as ensure:
        assert "0 repaired, 1 adopted" in reconcile()

    assert placed(room) == ("default", "RM_started", None)
    room.refresh_from_db()
    assert room.last_started_at is not None
    ensure.assert_called_once_with(room)

    with mock.patch.object(SIPManagement, "ensure_dispatch_rule") as ensure:
        assert join(room, ensure_room=False) == ("default", "RM_started")
        assert "0 repaired, 0 adopted" in reconcile()

    ensure.assert_not_called()
    assert not livekit.deleted


def test_split_room_closed_and_followed(livekit, lobby_clearings):
    """A room split between two clusters, its participants on the cluster it
    is not placed on having had their LiveKit room started there while its
    room_started was lost, is joined again: a reconciliation closes the
    LiveKit room it is not placed on, and its participants, reporting it
    deleted, are sent to the one its placement names, where the others are.
    Nothing is cleaned up, the meeting going on."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    name = str(room.id)
    _cluster_name, sid = join(room)
    livekit.live("paris", name, "RM_split", num_participants=2)

    assert "1 closed," in reconcile()

    assert livekit.deleted == [("paris", name)]
    assert placed(room) == ("lyon", sid, None)

    assert join(
        room, ensure_room=False, failure="deleted", failed_room_sid="RM_split"
    ) == ("lyon", sid)

    assert (
        "0 marked absent, 0 live again, 0 deleted, 0 repaired, 0 adopted, 0 closed"
        in (reconcile())
    )
    assert placed(room) == ("lyon", sid, None)
    lobby_clearings.assert_not_called()
