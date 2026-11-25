"""Unit tests for the circuit breakers of the LiveKit clusters."""

import asyncio
import contextlib
import json
import logging
import time
from datetime import timedelta
from unittest import mock

from django.core.cache import cache

import aiohttp
import pytest
from asgiref.sync import async_to_sync, sync_to_async
from freezegun import freeze_time
from livekit.api import (  # pylint: disable=no-name-in-module
    CreateRoomRequest,
    DeleteRoomRequest,
    ListEgressRequest,
    ListSIPDispatchRuleRequest,
    MuteRoomTrackRequest,
    RoomParticipantIdentity,
    TwirpError,
    UpdateRoomMetadataRequest,
)

from core import utils
from core.livekit import breaker
from core.livekit.breaker import (
    PROBE_MARGIN_SECONDS,
    BreakerState,
    LiveKitClusterBreaker,
    admitting_clusters,
    breaker_state,
    breaker_states,
)
from core.livekit.clusters import get_livekit_cluster, get_livekit_clusters
from core.livekit.exceptions import LiveKitClusterUnavailableError
from core.livekit.placements import PlacementService
from core.tests.utils import (
    UNREACHABLE_LIVEKIT_URL,
    call_room_service,
    list_livekit_rooms,
    livekit_cluster_entry,
    open_livekit_breaker,
)

ROOM_SERVICE_PATH = "/twirp/livekit.RoomService"
LIST_ROOMS_PATH = f"{ROOM_SERVICE_PATH}/ListRooms"


@pytest.fixture(name="cluster")
def cluster_fixture(settings, livekit_breakers, fake_livekit_server):
    """Register a LiveKit cluster called on the fake LiveKit API, its circuit
    breaker enabled, and return it."""
    name = livekit_breakers()
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry(name, api_url=fake_livekit_server.url)]
    )
    return get_livekit_cluster(name)


def breaker_records(caplog):
    """Return the level and message of each record the breakers logged."""
    return [
        (record.levelname, record.getMessage())
        for record in caplog.records
        if record.name == "core.livekit.breaker"
    ]


async def wait_for_call(server):
    """Wait until a call reaches the fake LiveKit API, for 5 seconds at most."""
    async with asyncio.timeout(5):
        while not server.paths:
            await asyncio.sleep(0.01)


FAILURES = {
    "unreachable": aiohttp.ClientConnectorError,
    "server-error": TwirpError,
    "timeout": TimeoutError,
}

ROOM_CALLS = {
    "MutePublishedTrack": lambda client: client.room.mute_published_track(
        MuteRoomTrackRequest(
            room="my-room", identity="absent", track_sid="TR_absent", muted=True
        )
    ),
    "GetParticipant": lambda client: client.room.get_participant(
        RoomParticipantIdentity(room="my-room", identity="absent")
    ),
    "UpdateRoomMetadata": lambda client: client.room.update_room_metadata(
        UpdateRoomMetadataRequest(room="my-room", metadata="{}")
    ),
    "DeleteRoom": lambda client: client.room.delete_room(
        DeleteRoomRequest(room="my-room")
    ),
}


@async_to_sync
async def call_room(cluster, method, *, timeout=None):
    """Call the room service of a LiveKit cluster once about one LiveKit room
    or one of its participants, with a new client.

    Return the error the call raised, or None when it was answered.
    """
    client = utils.create_livekit_client(cluster=cluster, timeout=timeout)
    try:
        await ROOM_CALLS[method](client)
    except (TwirpError, TimeoutError, aiohttp.ClientError) as error:
        return error
    finally:
        await client.aclose()
    return None


@pytest.mark.parametrize("failure", FAILURES)
def test_breaker_opens(
    failure, settings, livekit_breakers, fake_livekit_server, caplog
):
    """The circuit breaker of a LiveKit cluster whose room service fails to
    answer LIVEKIT_BREAKER_FAILURE_THRESHOLD times in a row opens, which is
    logged as a warning, once: the cluster could not be reached, answered with
    a server error, or did not answer before the client gave up, a timeout the
    breaker sees as it wraps the middleware giving up. Calls to its room
    service are then refused at once, without reaching it, with a TimeoutError.
    """
    name = livekit_breakers()
    api_url = (
        UNREACHABLE_LIVEKIT_URL if failure == "unreachable" else fake_livekit_server.url
    )
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry(name, api_url=api_url)]
    )
    cluster = get_livekit_cluster(name)
    fake_livekit_server.status = 503
    if failure == "timeout":
        fake_livekit_server.released.clear()

    states = []
    errors = []
    with caplog.at_level(logging.INFO, logger="core.livekit.breaker"):
        for _call in range(3):
            states.append(breaker_state(name))
            errors.append(call_room_service(cluster, timeout=0.2))

    assert states == [BreakerState.CLOSED] * 3
    assert breaker_state(name) is BreakerState.OPEN
    for error in errors:
        assert isinstance(error, FAILURES[failure])
        assert not isinstance(error, LiveKitClusterUnavailableError)
    if failure != "unreachable":
        assert fake_livekit_server.paths == [LIST_ROOMS_PATH] * 3
    assert breaker_records(caplog) == [
        (
            "WARNING",
            f"LiveKit cluster {name} failed to answer 3 times in a row: its "
            "circuit breaker opens for 30 s",
        )
    ]

    calls = list(fake_livekit_server.paths)
    fake_livekit_server.released.clear()
    started = time.monotonic()
    error = call_room_service(cluster, timeout=5)
    elapsed = time.monotonic() - started

    assert isinstance(error, LiveKitClusterUnavailableError)
    assert isinstance(error, TimeoutError)
    assert str(error) == (
        f"LiveKit cluster {name} is unavailable: its circuit breaker refused the call."
    )
    assert fake_livekit_server.paths == calls
    assert elapsed < 2
    assert breaker_state(name) is BreakerState.OPEN


@pytest.mark.parametrize("status", (500, 502, 503, 504))
def test_breaker_opens_on_create_room(status, cluster, fake_livekit_server):
    """Creating a LiveKit room, which every join does, is a call addressed to
    the cluster as a whole, as listing its rooms is: its failures open the
    circuit breaker, whichever 5xx status answers them, a 500 included, as
    when the node is full."""
    fake_livekit_server.status = status

    @async_to_sync
    async def create_room():
        client = utils.create_livekit_client(cluster=cluster)
        try:
            await client.room.create_room(CreateRoomRequest(name="my-room"))
        except (TwirpError, TimeoutError) as error:
            return error
        finally:
            await client.aclose()
        return None

    states = []
    for _call in range(3):
        states.append(breaker_state(cluster.name))
        assert create_room().status == status

    assert states == [BreakerState.CLOSED] * 3
    assert breaker_state(cluster.name) is BreakerState.OPEN
    assert isinstance(create_room(), LiveKitClusterUnavailableError)
    assert fake_livekit_server.paths == [f"{ROOM_SERVICE_PATH}/CreateRoom"] * 3


@pytest.mark.parametrize("failure", FAILURES)
@pytest.mark.parametrize("method", ROOM_CALLS)
def test_breaker_room_calls_failures(
    method, failure, settings, livekit_breakers, fake_livekit_server
):
    """The calls to the room service about one LiveKit room or one participant
    never open the circuit breaker, however they fail: their failures may tell
    about that room or participant only, as the 503 answered when muting a
    participant who left. They are not counted either: it still takes
    LIVEKIT_BREAKER_FAILURE_THRESHOLD failed cluster-wide calls to open it."""
    name = livekit_breakers()
    api_url = (
        UNREACHABLE_LIVEKIT_URL if failure == "unreachable" else fake_livekit_server.url
    )
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry(name, api_url=api_url)]
    )
    cluster = get_livekit_cluster(name)
    fake_livekit_server.status = 503
    if failure == "timeout":
        fake_livekit_server.released.clear()

    errors = [call_room(cluster, method, timeout=0.2) for _call in range(4)]

    for error in errors:
        assert isinstance(error, FAILURES[failure])
        assert not isinstance(error, LiveKitClusterUnavailableError)
    assert breaker_state(name) is BreakerState.CLOSED
    if failure != "unreachable":
        assert fake_livekit_server.paths == [f"{ROOM_SERVICE_PATH}/{method}"] * 4

    fake_livekit_server.released.set()
    for _call in range(2):
        call_room_service(cluster)
    assert breaker_state(name) is BreakerState.CLOSED
    call_room_service(cluster)
    assert breaker_state(name) is BreakerState.OPEN


@pytest.mark.parametrize("status", (200, 404))
def test_breaker_room_calls_answers(status, cluster, fake_livekit_server):
    """An answer to a call about one LiveKit room or one participant does not
    reset the count of failures in a row of the cluster-wide calls."""
    fake_livekit_server.status = 503
    for _call in range(2):
        call_room_service(cluster)
    fake_livekit_server.status = status
    answer = call_room(cluster, "MutePublishedTrack")
    fake_livekit_server.status = 503
    call_room_service(cluster)

    assert getattr(answer, "status", 200) == status
    assert breaker_state(cluster.name) is BreakerState.OPEN


@pytest.mark.parametrize("method", ROOM_CALLS)
def test_breaker_room_calls_refused(method, cluster, fake_livekit_server):
    """While the circuit breaker is open, the calls about one LiveKit room or
    one participant are refused at once too, without reaching the cluster."""
    fake_livekit_server.status = 503
    open_livekit_breaker(cluster)
    fake_livekit_server.released.clear()

    started = time.monotonic()
    error = call_room(cluster, method, timeout=5)
    elapsed = time.monotonic() - started

    assert isinstance(error, LiveKitClusterUnavailableError)
    assert str(error) == (
        f"LiveKit cluster {cluster.name} is unavailable: its circuit breaker "
        "refused the call."
    )
    assert elapsed < 2
    assert fake_livekit_server.paths == [LIST_ROOMS_PATH] * 3
    assert breaker_state(cluster.name) is BreakerState.OPEN


@pytest.mark.parametrize("threshold", (1, 5))
def test_breaker_threshold(threshold, settings, cluster, fake_livekit_server):
    """The circuit breaker opens once its cluster failed to answer
    LIVEKIT_BREAKER_FAILURE_THRESHOLD times in a row, not before."""
    settings.LIVEKIT_BREAKER_FAILURE_THRESHOLD = threshold
    fake_livekit_server.status = 503

    states = []
    for _call in range(threshold):
        states.append(breaker_state(cluster.name))
        call_room_service(cluster)

    assert states == [BreakerState.CLOSED] * threshold
    assert breaker_state(cluster.name) is BreakerState.OPEN
    assert fake_livekit_server.paths == [LIST_ROOMS_PATH] * threshold


def test_breaker_api_url_path(settings, livekit_breakers, fake_livekit_server):
    """The calls to the room service of a LiveKit cluster reached at a path of
    its API URL, as behind a reverse proxy, go through its circuit breaker
    too."""
    name = livekit_breakers()
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry(name, api_url=f"{fake_livekit_server.url}/livekit")]
    )
    cluster = get_livekit_cluster(name)
    fake_livekit_server.status = 503

    open_livekit_breaker(cluster)

    assert isinstance(call_room_service(cluster), LiveKitClusterUnavailableError)
    assert fake_livekit_server.paths == [f"/livekit{LIST_ROOMS_PATH}"] * 3


@pytest.mark.parametrize("status", (200, 404))
def test_breaker_answers_reset_failures(status, cluster, fake_livekit_server):
    """Any answer of the room service but a server error resets the count of
    failures in a row, a client error included, such as a LiveKit room not
    found: the cluster answers."""
    for _round in range(3):
        fake_livekit_server.status = 503
        for _call in range(2):
            call_room_service(cluster)
        fake_livekit_server.status = status
        call_room_service(cluster)

    assert breaker_state(cluster.name) is BreakerState.CLOSED

    fake_livekit_server.status = 503
    for _call in range(3):
        call_room_service(cluster)

    assert breaker_state(cluster.name) is BreakerState.OPEN
    assert fake_livekit_server.paths == [LIST_ROOMS_PATH] * 12


def test_breaker_client_errors(cluster, fake_livekit_server):
    """Client errors of the room service never open the circuit breaker."""
    fake_livekit_server.status = 404

    errors = [call_room_service(cluster) for _call in range(5)]

    assert [(error.code, error.status) for error in errors] == [("not_found", 404)] * 5
    assert breaker_state(cluster.name) is BreakerState.CLOSED
    assert fake_livekit_server.paths == [LIST_ROOMS_PATH] * 5


OTHER_SERVICE_CALLS = {
    "Egress": lambda client: client.egress.list_egress(ListEgressRequest()),
    "AgentDispatchService": lambda client: client.agent_dispatch.list_dispatch(
        room_name="my-room"
    ),
    "SIP": lambda client: client.sip.list_dispatch_rule(ListSIPDispatchRuleRequest()),
}


@pytest.mark.parametrize("service", OTHER_SERVICE_CALLS)
def test_breaker_other_services(service, cluster, fake_livekit_server):
    """Calls to the other services of a LiveKit cluster are neither counted nor
    refused: egress answers 503 when no egress worker is available, which does
    not tell that the cluster is down."""
    fake_livekit_server.status = 503

    @async_to_sync
    async def call_service():
        client = utils.create_livekit_client(cluster=cluster)
        try:
            await OTHER_SERVICE_CALLS[service](client)
        except TwirpError as error:
            return error
        finally:
            await client.aclose()
        return None

    errors = [call_service() for _call in range(4)]

    assert breaker_state(cluster.name) is BreakerState.CLOSED

    open_livekit_breaker(cluster)
    errors.append(call_service())

    assert [error.status for error in errors] == [503] * 5
    service_paths = [
        path for path in fake_livekit_server.paths if path != LIST_ROOMS_PATH
    ]
    assert len(service_paths) == 5
    assert all(path.startswith(f"/twirp/livekit.{service}/") for path in service_paths)


def test_breaker_half_open(settings, cluster, fake_livekit_server, caplog):
    """Once LIVEKIT_BREAKER_OPEN_SECONDS have passed since it opened, the
    circuit breaker is half-open: the next call to the room service probes the
    cluster, while the others are still refused at once. The probe answered,
    the breaker closes, which is logged, and failures are counted from zero."""
    settings.LIVEKIT_BREAKER_OPEN_SECONDS = 10
    fake_livekit_server.status = 503

    @async_to_sync
    async def probe_while_calling():
        probe = asyncio.create_task(list_livekit_rooms(cluster))
        await wait_for_call(fake_livekit_server)
        others = [await list_livekit_rooms(cluster, timeout=1) for _call in range(3)]
        fake_livekit_server.released.set()
        return await probe, others

    with freeze_time("2026-11-07 12:00:00", real_asyncio=True) as frozen:
        open_livekit_breaker(cluster)
        frozen.tick(timedelta(seconds=9))
        assert breaker_state(cluster.name) is BreakerState.OPEN
        frozen.tick(timedelta(seconds=1))
        assert breaker_state(cluster.name) is BreakerState.HALF_OPEN

        fake_livekit_server.paths.clear()
        fake_livekit_server.status = 200
        fake_livekit_server.released.clear()
        caplog.clear()
        with caplog.at_level(logging.INFO, logger="core.livekit.breaker"):
            probe, others = probe_while_calling()

        assert probe is None
        assert len(others) == 3
        for error in others:
            assert isinstance(error, LiveKitClusterUnavailableError)
        assert fake_livekit_server.paths == [LIST_ROOMS_PATH]
        assert breaker_state(cluster.name) is BreakerState.CLOSED
        assert breaker_records(caplog) == [
            (
                "INFO",
                f"LiveKit cluster {cluster.name} answers again: its circuit "
                "breaker closes",
            )
        ]

        fake_livekit_server.status = 503
        for _call in range(2):
            call_room_service(cluster)
        assert breaker_state(cluster.name) is BreakerState.CLOSED
        call_room_service(cluster)
        assert breaker_state(cluster.name) is BreakerState.OPEN


@pytest.mark.parametrize("method", ROOM_CALLS)
def test_breaker_half_open_room_calls(method, cluster, fake_livekit_server, caplog):
    """While the circuit breaker is half-open, a call about one LiveKit room or
    one participant is refused without reaching the cluster: it neither probes
    the cluster, which the next cluster-wide call still does, nor closes the
    breaker."""
    fake_livekit_server.status = 503

    with freeze_time("2026-11-07 12:00:00", real_asyncio=True) as frozen:
        open_livekit_breaker(cluster)
        frozen.tick(timedelta(seconds=30))
        fake_livekit_server.paths.clear()
        fake_livekit_server.status = 200
        caplog.clear()

        with caplog.at_level(logging.INFO, logger="core.livekit.breaker"):
            refused = [call_room(cluster, method) for _call in range(2)]
        state = breaker_state(cluster.name)
        admitting = admitting_clusters([cluster.name])
        claims = cache.keys(f"livekit-breaker_{cluster.name}_probe_*")
        reached = list(fake_livekit_server.paths)

        probe = call_room_service(cluster)
        closed = breaker_state(cluster.name)
        answered = call_room(cluster, method)

    for error in refused:
        assert isinstance(error, LiveKitClusterUnavailableError)
    assert state is BreakerState.HALF_OPEN
    assert admitting == {cluster.name}
    assert not claims
    assert not reached
    assert not breaker_records(caplog)
    assert probe is None
    assert closed is BreakerState.CLOSED
    assert answered is None
    assert fake_livekit_server.paths == [
        LIST_ROOMS_PATH,
        f"{ROOM_SERVICE_PATH}/{method}",
    ]


def test_breaker_probe_failure(settings, cluster, fake_livekit_server, caplog):
    """A probe that fails opens the circuit breaker again, for
    LIVEKIT_BREAKER_OPEN_SECONDS, which is logged as a warning."""
    settings.LIVEKIT_BREAKER_OPEN_SECONDS = 10
    fake_livekit_server.status = 503

    with freeze_time("2026-11-07 12:00:00", real_asyncio=True) as frozen:
        open_livekit_breaker(cluster)
        frozen.tick(timedelta(seconds=15))
        assert breaker_state(cluster.name) is BreakerState.HALF_OPEN

        caplog.clear()
        with caplog.at_level(logging.INFO, logger="core.livekit.breaker"):
            probe = call_room_service(cluster)
        refused = call_room_service(cluster)
        frozen.tick(timedelta(seconds=9))
        still_open = breaker_state(cluster.name)
        frozen.tick(timedelta(seconds=1))
        half_open = breaker_state(cluster.name)

    assert probe.status == 503
    assert isinstance(refused, LiveKitClusterUnavailableError)
    assert still_open is BreakerState.OPEN
    assert half_open is BreakerState.HALF_OPEN
    assert fake_livekit_server.paths == [LIST_ROOMS_PATH] * 4
    assert breaker_records(caplog) == [
        (
            "WARNING",
            f"LiveKit cluster {cluster.name} failed to answer again: its circuit "
            "breaker opens again for 10 s",
        )
    ]


def test_breaker_cancelled_probe(cluster, fake_livekit_server):
    """A probe cancelled before the cluster answered, which tells nothing about
    the cluster, lets the next call probe it at once."""
    fake_livekit_server.status = 503

    @async_to_sync
    async def cancel_probe_then_call():
        probe = asyncio.create_task(list_livekit_rooms(cluster))
        await wait_for_call(fake_livekit_server)
        probe.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await probe
        fake_livekit_server.released.set()
        return await list_livekit_rooms(cluster, timeout=1)

    with freeze_time("2026-11-07 12:00:00", real_asyncio=True) as frozen:
        open_livekit_breaker(cluster)
        frozen.tick(timedelta(seconds=30))
        fake_livekit_server.paths.clear()
        fake_livekit_server.status = 200
        fake_livekit_server.released.clear()

        assert cancel_probe_then_call() is None
        assert breaker_state(cluster.name) is BreakerState.CLOSED

    assert fake_livekit_server.paths == [LIST_ROOMS_PATH] * 2


@pytest.mark.django_db
def test_breaker_probe_candidates(settings, livekit_breakers, fake_livekit_server):
    """A cluster whose circuit breaker is half-open receives no new placements
    while a call probes it, since every other call to it is refused until the
    probe ends. It receives them again once the probe was answered."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry(livekit_breakers(), api_url=fake_livekit_server.url)
            for _cluster in range(2)
        ]
    )
    available, probed = get_livekit_clusters()
    fake_livekit_server.status = 503

    @async_to_sync
    async def candidates_while_probing():
        probe = asyncio.create_task(list_livekit_rooms(probed))
        await wait_for_call(fake_livekit_server)
        candidates = await sync_to_async(PlacementService.candidates)()
        fake_livekit_server.released.set()
        return candidates, await probe

    with freeze_time("2026-11-07 12:00:00", real_asyncio=True) as frozen:
        open_livekit_breaker(probed)
        frozen.tick(timedelta(seconds=30))
        before_probe = PlacementService.candidates()
        fake_livekit_server.paths.clear()
        fake_livekit_server.status = 200
        fake_livekit_server.released.clear()

        while_probing, probe = candidates_while_probing()
        after_probe = PlacementService.candidates()

    assert before_probe == (available, probed)
    assert while_probing == (available,)
    assert probe is None
    assert fake_livekit_server.paths == [LIST_ROOMS_PATH]
    assert after_probe == (available, probed)


def test_breaker_probe_claim_expires(cluster, fake_livekit_server):
    """A probe claims its turn for as long as its call may last, the timeout of
    its client, and PROBE_MARGIN_SECONDS more: should it never end, another call
    may probe the cluster then."""
    fake_livekit_server.status = 503

    @async_to_sync
    async def claims_while_probing():
        probe = asyncio.create_task(list_livekit_rooms(cluster, timeout=2))
        await wait_for_call(fake_livekit_server)
        claims = cache.keys(f"livekit-breaker_{cluster.name}_probe_*")
        ttls = [cache.ttl(claim) for claim in claims]
        fake_livekit_server.released.set()
        await probe
        return ttls

    with freeze_time("2026-11-07 12:00:00", real_asyncio=True) as frozen:
        open_livekit_breaker(cluster)
        frozen.tick(timedelta(seconds=30))
        fake_livekit_server.paths.clear()
        fake_livekit_server.released.clear()

        [ttl] = claims_while_probing()

    assert 2 < ttl <= 2 + PROBE_MARGIN_SECONDS


def test_breaker_per_cluster(settings, livekit_breakers, fake_livekit_server):
    """Each LiveKit cluster has its own circuit breaker. A client built without
    cluster nor custom configuration calls the default cluster, through its
    breaker."""
    names = [livekit_breakers() for _cluster in range(2)]
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry(name, api_url=fake_livekit_server.url) for name in names]
    )
    default, other = get_livekit_clusters()
    fake_livekit_server.status = 503

    for _call in range(3):
        call_room_service()

    assert breaker_states(names) == {
        default.name: BreakerState.OPEN,
        other.name: BreakerState.CLOSED,
    }
    assert isinstance(call_room_service(), LiveKitClusterUnavailableError)
    assert call_room_service(other).status == 503


def test_breaker_custom_configuration(cluster, fake_livekit_server):
    """A client built from a custom configuration, as the egress worker builds
    one, has no circuit breaker: its calls are neither counted nor refused, even
    to the API URL of a cluster whose breaker is open."""
    configuration = utils.livekit_api_configuration(cluster)
    fake_livekit_server.status = 503

    errors = [
        call_room_service(custom_configuration=configuration) for _call in range(4)
    ]

    assert breaker_state(cluster.name) is BreakerState.CLOSED

    open_livekit_breaker(cluster)
    errors.append(call_room_service(custom_configuration=configuration))

    assert [error.status for error in errors] == [503] * 5
    assert fake_livekit_server.paths == [LIST_ROOMS_PATH] * 8


def test_breaker_states(settings, livekit_breakers):
    """The states of the circuit breakers of several clusters are read from the
    cache in one call, and none for no cluster."""
    settings.LIVEKIT_BREAKER_OPEN_SECONDS = 10
    names = [livekit_breakers() for _cluster in range(3)]
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry(name, api_url=UNREACHABLE_LIVEKIT_URL) for name in names]
    )
    closed, opened, half_opened = get_livekit_clusters()

    with freeze_time("2026-11-07 12:00:00", real_asyncio=True) as frozen:
        open_livekit_breaker(half_opened)
        frozen.tick(timedelta(seconds=10))
        open_livekit_breaker(opened)

        with mock.patch.object(breaker, "cache", wraps=cache) as breaker_cache:
            states = breaker_states(names)
            assert len(breaker_cache.mock_calls) == 1
            assert not breaker_states([])
            assert len(breaker_cache.mock_calls) == 1

    assert states == {
        closed.name: BreakerState.CLOSED,
        opened.name: BreakerState.OPEN,
        half_opened.name: BreakerState.HALF_OPEN,
    }


def test_breaker_admitting_clusters(settings, livekit_breakers):
    """Clusters admit calls while their circuit breaker is closed, or half-open
    and no call probes them, which is read from the cache in one call, one more
    when a breaker is half-open, and none for no cluster. A breaker stays
    half-open while a call probes its cluster."""
    settings.LIVEKIT_BREAKER_OPEN_SECONDS = 10
    names = [livekit_breakers() for _cluster in range(4)]
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry(name, api_url=UNREACHABLE_LIVEKIT_URL) for name in names]
    )
    closed, opened, half_opened, probed = get_livekit_clusters()

    with freeze_time("2026-11-07 12:00:00", real_asyncio=True) as frozen:
        open_livekit_breaker(half_opened)
        open_livekit_breaker(probed)
        frozen.tick(timedelta(seconds=10))
        open_livekit_breaker(opened)
        probe_key = LiveKitClusterBreaker(probed.name).admit(probe_seconds=5)

        with mock.patch.object(breaker, "cache", wraps=cache) as breaker_cache:
            while_probing = admitting_clusters(names)
            assert len(breaker_cache.mock_calls) == 2
            assert admitting_clusters([closed.name, opened.name]) == {closed.name}
            assert len(breaker_cache.mock_calls) == 3
            assert admitting_clusters([]) == set()
            assert len(breaker_cache.mock_calls) == 3

        state = breaker_state(probed.name)
        LiveKitClusterBreaker.release(probe_key)
        after_probe = admitting_clusters(names)

    assert probe_key is not None
    assert while_probing == {closed.name, half_opened.name}
    assert state is BreakerState.HALF_OPEN
    assert after_probe == {closed.name, half_opened.name, probed.name}


@pytest.mark.django_db
def test_breaker_disabled(settings, fake_livekit_server):
    """While LIVEKIT_BREAKER_ENABLED is off, calls are never refused and every
    circuit breaker is closed, without the cache being accessed at all."""
    settings.LIVEKIT_BREAKER_ENABLED = False
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry("paris", api_url=fake_livekit_server.url)]
    )
    cluster = get_livekit_cluster("paris")
    fake_livekit_server.status = 503

    with mock.patch.object(breaker, "cache") as breaker_cache:
        errors = [call_room_service(cluster) for _call in range(5)]
        candidates = PlacementService.candidates()
        state = breaker_state("paris")

    assert [error.status for error in errors] == [503] * 5
    assert fake_livekit_server.paths == [LIST_ROOMS_PATH] * 5
    assert candidates == (cluster,)
    assert state is BreakerState.CLOSED
    assert not breaker_cache.mock_calls
