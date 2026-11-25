"""Circuit breakers of the LiveKit clusters.

Django calls the room service of a LiveKit cluster to create the LiveKit rooms
it hands out credentials for, and while a cluster cannot be reached, each of
these calls waits for its timeout before failing. Each cluster
has a circuit breaker guarding the calls to its room service, whose state lives
in the Django cache, shared by every process:

- closed, calls go through. LIVEKIT_BREAKER_FAILURE_THRESHOLD failures in a row
  open it: the cluster could not be reached, did not answer in time or answered
  with a server error. Any other answer, a client error included, shows that
  the cluster answers, and resets the count.
- open, calls are refused at once with LiveKitClusterUnavailableError, without
  reaching the network, and the cluster receives no new placements. Once
  LIVEKIT_BREAKER_OPEN_SECONDS have passed since it opened, it is half-open.
- half-open, the next call that counts goes through as a probe, while the
  others are still refused. The cluster may receive new placements again,
  except while a call probes it. The breaker closes when the probe is answered,
  and opens again when it fails.

Only the calls addressed to the cluster as a whole count, as failures, as
answers and as probes: CreateRoom, which joins make to ensure a LiveKit room,
and ListRooms, which the reconciliation of placements makes every minute. The
other calls to the room service are addressed to one LiveKit room or to one
participant, and their failures may tell about that room or participant only:
muting a participant who left is answered with a 503. They are refused while
the breaker is open or half-open, and otherwise go through uncounted.

Calls to the other services of a cluster, such as egress, whose 503 tells that
no egress worker is available rather than that the cluster is down, are neither
counted nor refused.
"""

import time
from collections.abc import Iterable
from enum import StrEnum
from logging import getLogger

from django.conf import settings
from django.core.cache import cache

import aiohttp

from .exceptions import LiveKitClusterUnavailableError

logger = getLogger(__name__)

ROOM_SERVICE_PATH = "/twirp/livekit.RoomService"
CLUSTER_WIDE_METHODS = frozenset({"CreateRoom", "ListRooms"})
PROBE_MARGIN_SECONDS = 5


class BreakerState(StrEnum):
    """The states of the circuit breaker of a LiveKit cluster."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half-open"


def _opened_at_key(cluster_name: str) -> str:
    """Return the cache key holding when the breaker of a cluster opened."""
    return f"livekit-breaker_{cluster_name}_opened-at"


def _probe_key(cluster_name: str, opened_at: float) -> str:
    """Return the cache key a call claims to probe a cluster, whose breaker
    opened at `opened_at`."""
    return f"livekit-breaker_{cluster_name}_probe_{opened_at!r}"


def _read_opened_at(cluster_names: list[str]) -> dict[str, float]:
    """Return when the circuit breakers of these LiveKit clusters opened, by
    name, for those that are not closed, read from the cache in one call."""
    keys = {_opened_at_key(name): name for name in cluster_names}
    return {keys[key]: value for key, value in cache.get_many(list(keys)).items()}


def _state(opened_at: float | None, now: float) -> BreakerState:
    """Return the state, at `now`, of a breaker open since `opened_at`, if set.

    Both are seconds since the epoch, as time.time() returns.
    """
    if opened_at is None:
        return BreakerState.CLOSED
    if now < opened_at + settings.LIVEKIT_BREAKER_OPEN_SECONDS:
        return BreakerState.OPEN
    return BreakerState.HALF_OPEN


def breaker_states(cluster_names: Iterable[str]) -> dict[str, BreakerState]:
    """Return the states of the circuit breakers of LiveKit clusters, by name.

    They are read from the cache in one call. While LIVEKIT_BREAKER_ENABLED is
    off, every breaker is closed, and the cache is not read.
    """
    names = list(cluster_names)
    if not (settings.LIVEKIT_BREAKER_ENABLED and names):
        return dict.fromkeys(names, BreakerState.CLOSED)
    opened_at = _read_opened_at(names)
    now = time.time()
    return {name: _state(opened_at.get(name), now) for name in names}


def breaker_state(cluster_name: str) -> BreakerState:
    """Return the state of the circuit breaker of a LiveKit cluster."""
    return breaker_states([cluster_name])[cluster_name]


def admitting_clusters(cluster_names: Iterable[str]) -> set[str]:
    """Return the names of the LiveKit clusters, among these, whose circuit
    breaker lets the next call to their room service through.

    Those are the clusters whose breaker is closed, and those whose breaker is
    half-open while no call probes them: until a probe ends, every other call
    is refused. The cache is read in one call, and one more when a breaker is
    half-open. While LIVEKIT_BREAKER_ENABLED is off, every cluster admits
    calls, and the cache is not read.
    """
    names = list(cluster_names)
    if not (settings.LIVEKIT_BREAKER_ENABLED and names):
        return set(names)
    opened_at = _read_opened_at(names)
    now = time.time()
    admitting = set()
    probe_keys = {}
    for name in names:
        state = _state(opened_at.get(name), now)
        if state is BreakerState.CLOSED:
            admitting.add(name)
        elif state is BreakerState.HALF_OPEN:
            probe_keys[_probe_key(name, opened_at[name])] = name
    if probe_keys:
        probing = cache.get_many(list(probe_keys))
        admitting.update(name for key, name in probe_keys.items() if key not in probing)
    return admitting


class LiveKitClusterBreaker:
    """The circuit breaker of a LiveKit cluster, kept in the Django cache.

    The cache holds how many cluster-wide calls to the cluster's room service
    failed in a row, and when the breaker opened, until it closes. A call probing the
    cluster claims a key of its own for each time the breaker opened, which
    expires: a probe that never ends lets another call probe the cluster once
    its claim expired.
    """

    def __init__(self, cluster_name: str):
        self.cluster_name = cluster_name
        self.failures_key = f"livekit-breaker_{cluster_name}_failures"
        self.opened_at_key = _opened_at_key(cluster_name)

    def admit(self, probe_seconds: float) -> str | None:
        """Let a cluster-wide call to the room service through, or refuse it.

        A call goes through while the breaker is closed, and None is returned.
        While it is half-open, the first call claims the probe for
        `probe_seconds` and goes through, the key it claimed being returned.
        Other calls raise LiveKitClusterUnavailableError.
        """
        opened_at = cache.get(self.opened_at_key)
        state = _state(opened_at, time.time())
        if state is BreakerState.CLOSED:
            return None
        if state is BreakerState.HALF_OPEN:
            probe_key = _probe_key(self.cluster_name, opened_at)
            if cache.add(probe_key, True, timeout=probe_seconds):
                return probe_key
        raise self._refusal()

    def require_closed(self) -> None:
        """Let a call to the room service that is not cluster-wide through
        while the breaker is closed.

        While it is open or half-open, the call raises
        LiveKitClusterUnavailableError: it never probes the cluster.
        """
        opened_at = cache.get(self.opened_at_key)
        if _state(opened_at, time.time()) is not BreakerState.CLOSED:
            raise self._refusal()

    def _refusal(self) -> LiveKitClusterUnavailableError:
        """Return the error raised by a call the breaker refuses."""
        return LiveKitClusterUnavailableError(
            f"LiveKit cluster {self.cluster_name} is unavailable: its circuit "
            "breaker refused the call."
        )

    def record_failure(self, probe_key: str | None) -> None:
        """Count a cluster-wide call to the room service that failed.

        A probe that failed opens the breaker again. Otherwise, the breaker
        opens once LIVEKIT_BREAKER_FAILURE_THRESHOLD calls failed in a row,
        unless it is open already.
        """
        now = time.time()
        open_seconds = settings.LIVEKIT_BREAKER_OPEN_SECONDS
        if probe_key is not None:
            cache.set(self.opened_at_key, now, timeout=None)
            logger.warning(
                "LiveKit cluster %s failed to answer again: its circuit breaker "
                "opens again for %d s",
                self.cluster_name,
                open_seconds,
            )
            return

        cache.add(self.failures_key, 0, timeout=None)
        try:
            failures = cache.incr(self.failures_key)
        except ValueError:
            failures = 1
        if failures >= settings.LIVEKIT_BREAKER_FAILURE_THRESHOLD and cache.add(
            self.opened_at_key, now, timeout=None
        ):
            logger.warning(
                "LiveKit cluster %s failed to answer %d times in a row: its "
                "circuit breaker opens for %d s",
                self.cluster_name,
                failures,
                open_seconds,
            )

    def record_answer(self, probe_key: str | None) -> None:
        """Reset the count of failures after a cluster-wide call to the room
        service was answered, closing the breaker when that call was a probe."""
        if probe_key is None:
            cache.delete(self.failures_key)
            return
        cache.delete_many([self.failures_key, self.opened_at_key])
        logger.info(
            "LiveKit cluster %s answers again: its circuit breaker closes",
            self.cluster_name,
        )

    @staticmethod
    def release(probe_key: str | None) -> None:
        """Give up the probe of a call that neither failed nor was answered,
        for the next call to probe the cluster."""
        if probe_key is not None:
            cache.delete(probe_key)


def _calls_room_service(request: aiohttp.ClientRequest) -> bool:
    """Tell whether a request calls the room service of a LiveKit cluster.

    Its path ends with the room service's and a method, after the path of the
    cluster's API URL, if any.
    """
    return request.url.path.rpartition("/")[0].endswith(ROOM_SERVICE_PATH)


def _is_cluster_wide(request: aiohttp.ClientRequest) -> bool:
    """Tell whether a request calling the room service of a LiveKit cluster is
    addressed to the cluster as a whole, rather than to one LiveKit room or to
    one participant."""
    return request.url.path.rpartition("/")[2] in CLUSTER_WIDE_METHODS


def guard_room_service(
    cluster_name: str, timeout: float
) -> aiohttp.ClientMiddlewareType:
    """Return a client middleware putting the calls to the room service of a
    LiveKit cluster under its circuit breaker.

    It must come before the middleware giving up on calls after `timeout`
    seconds, so that the breaker counts these timeouts. A call probing the
    cluster claims the probe for that long and PROBE_MARGIN_SECONDS more. Only
    cluster-wide calls are counted and may probe the cluster.
    """
    breaker = LiveKitClusterBreaker(cluster_name)
    probe_seconds = timeout + PROBE_MARGIN_SECONDS

    async def guard_room_service_request(
        request: aiohttp.ClientRequest, handler: aiohttp.ClientHandlerType
    ) -> aiohttp.ClientResponse:
        if not _calls_room_service(request):
            return await handler(request)
        if not _is_cluster_wide(request):
            breaker.require_closed()
            return await handler(request)
        probe_key = breaker.admit(probe_seconds)
        try:
            response = await handler(request)
        except (aiohttp.ClientError, TimeoutError):
            breaker.record_failure(probe_key)
            raise
        except BaseException:
            breaker.release(probe_key)
            raise
        if response.status >= 500:
            breaker.record_failure(probe_key)
        else:
            breaker.record_answer(probe_key)
        return response

    return guard_room_service_request
