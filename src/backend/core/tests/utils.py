"""Shared helpers for tests in the Meet core application"""

import base64
import hashlib
import itertools
import secrets
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import partial
from unittest import mock

from django.conf import settings
from django.db.models import QuerySet

import jwt
from asgiref.sync import sync_to_async
from livekit.api import AccessToken, TwirpError
from livekit.protocol.models import Room as LiveKitRoom  # pylint: disable=E0611
from livekit.protocol.room import (  # pylint: disable=E0611
    DeleteRoomResponse,
    ListRoomsResponse,
)

from core.factories import ApplicationFactory
from core.models import ApplicationScope

CREATED_LIVEKIT_ROOM_SID = "RM_created"
CREATED_LIVEKIT_ROOM_TIME_MS = 1_763_550_000_123
LAZY_JOIN = {"ensure_room": False}


def livekit_room(
    sid=CREATED_LIVEKIT_ROOM_SID,
    *,
    creation_time_ms=CREATED_LIVEKIT_ROOM_TIME_MS,
    name="",
):
    """Return a LiveKit room as a LiveKit cluster describes it.

    It has this SID, and was created at CREATED_LIVEKIT_ROOM_TIME_MS unless
    told otherwise, 0 standing for an unknown creation time.
    """
    return LiveKitRoom(sid=sid, name=name, creation_time_ms=creation_time_ms)


def reporting(failure, sid="RM_failed"):
    """Return the payload of a frontend reporting a LiveKit room that failed it."""
    return {"ensure_room": False, "failure": failure, "failed_room_sid": sid}


class FakeLiveKitClusters:
    """Stand for the room services of the LiveKit clusters, as reached through
    the clients utils.create_livekit_client makes, its `client`.

    `rooms` holds the LiveKit rooms live on each cluster, by cluster name then
    room name. Each cluster lists them, creates them, giving each new one a SID
    of its own, and deletes them, which `deleted` records as pairs of cluster
    and room names. `asked_deletions` records every deletion asked, as pairs
    too, whether it failed or not. `errors` holds the error raised by every
    call of a name, list_rooms, create_room or delete_room, to a cluster, by
    pair of cluster name and call name. `on_list` is called with the name of
    each cluster listed, before it answers, in the thread that awaits the
    listing.
    """

    def __init__(self):
        """Start with no LiveKit room live anywhere."""
        self.rooms = defaultdict(dict)
        self.errors = {}
        self.deleted = []
        self.asked_deletions = []
        self.on_list = None
        self._created = itertools.count(1)

    def live(  # pylint: disable=too-many-arguments
        self,
        cluster_name,
        room_name,
        sid,
        *,
        num_participants=0,
        creation_time_ms=CREATED_LIVEKIT_ROOM_TIME_MS,
    ):
        """Make a LiveKit room live on a cluster."""
        self.rooms[cluster_name][room_name] = LiveKitRoom(
            sid=sid,
            name=room_name,
            num_participants=num_participants,
            creation_time_ms=creation_time_ms,
        )

    def finish(self, cluster_name, room_name):
        """Make a LiveKit room finish on a cluster, as when it empties."""
        del self.rooms[cluster_name][room_name]

    def client(self, *, cluster):
        """Return a client of the room service of a cluster."""
        client = mock.Mock()
        for call in ("list_rooms", "create_room", "delete_room"):
            answer = partial(getattr(self, f"_{call}"), cluster.name)
            setattr(client.room, call, mock.AsyncMock(side_effect=answer))
        client.aclose = mock.AsyncMock()
        return client

    def _raise_error(self, cluster_name, call):
        """Raise the error set for a call to a cluster, if any."""
        error = self.errors.get((cluster_name, call))
        if error is not None:
            raise error

    async def _list_rooms(self, cluster_name, request):
        """List the LiveKit rooms live on a cluster, those named only when
        names are given."""
        if self.on_list is not None:
            await sync_to_async(self.on_list)(cluster_name)
        self._raise_error(cluster_name, "list_rooms")
        rooms = self.rooms[cluster_name]
        names = list(request.names) or list(rooms)
        return ListRoomsResponse(rooms=[rooms[name] for name in names if name in rooms])

    def _create_room(self, cluster_name, request):
        """Create a LiveKit room on a cluster, unless it is live there, and
        return it."""
        self._raise_error(cluster_name, "create_room")
        rooms = self.rooms[cluster_name]
        if request.name not in rooms:
            created = next(self._created)
            rooms[request.name] = LiveKitRoom(
                sid=f"RM_{cluster_name}_{created}",
                name=request.name,
                creation_time_ms=CREATED_LIVEKIT_ROOM_TIME_MS + created,
            )
        return rooms[request.name]

    def _delete_room(self, cluster_name, request):
        """Delete a LiveKit room live on a cluster, which answers not found
        for one that is not."""
        self.asked_deletions.append((cluster_name, request.room))
        self._raise_error(cluster_name, "delete_room")
        if self.rooms[cluster_name].pop(request.room, None) is None:
            raise TwirpError("not_found", "room not found", status=404)
        self.deleted.append((cluster_name, request.room))
        return DeleteRoomResponse()


def changing_after_reads(change, *, every=False):
    """Patch reading the first object a query finds, for a change to happen
    right after the first read, or after every read."""
    first = QuerySet.first
    reads = []

    def read(queryset):
        found = first(queryset)
        if every or not reads:
            change()
        reads.append(found)
        return found

    return mock.patch.object(QuerySet, "first", autospec=True, side_effect=read)


def generate_user_access_token(user, application=None, **overrides):
    """Generate a valid user access JWT signed with the token secret.

    Claims can be overridden through keyword arguments; passing None for a
    claim removes it from the payload.
    """
    now = datetime.now(timezone.utc)

    if application is None:
        application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])

    payload = {
        "iss": settings.USER_ACCESS_TOKEN_ISSUER,
        "aud": settings.USER_ACCESS_TOKEN_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(seconds=settings.USER_ACCESS_TOKEN_TTL),
        "user_id": str(user.id),
        "token_type": settings.USER_ACCESS_TOKEN_TYPE_CLAIM,
        "client_id": application.client_id,
        "scope": "user:access",
    }
    payload.update(overrides)
    payload = {key: value for key, value in payload.items() if value is not None}

    return jwt.encode(
        payload,
        settings.USER_ACCESS_TOKEN_SECRET_KEY,
        algorithm=settings.USER_ACCESS_TOKEN_ALG,
    )


def random_remote_addr():
    """Return a random private source IP.

    A fresh IP per client isolates its anonymous throttle history, both
    between tests and between test runs.
    """
    # `secrets` rather than `random`: the global random module is seeded
    # deterministically by the factories, its sequence repeats across runs.
    return (
        f"10.{secrets.randbelow(256)}.{secrets.randbelow(256)}"
        f".{secrets.randbelow(254) + 1}"
    )


def livekit_cluster_entry(name, **overrides):
    """Describe a LiveKit cluster as an entry of LIVEKIT_CLUSTERS.

    Each cluster gets its own API key, and a secret long enough to sign tokens.
    """
    return {
        "name": name,
        "url": f"wss://{name}.livekit.test",
        "api_key": f"key-{name}",
        "api_secret": f"secret-{name}-padded-for-minimum-len!-livekit",
        **overrides,
    }


def livekit_webhook_token(body, api_key, api_secret):
    """Return the token a LiveKit cluster sends with a webhook body.

    It is signed with this API key and secret, and holds the body's SHA-256.
    """
    token = AccessToken(api_key, api_secret)
    token.claims.sha256 = base64.b64encode(
        hashlib.sha256(body.encode()).digest()
    ).decode()
    return token.to_jwt()


def transit_code_target(code):
    """Return the audit target of a code: its SHA-256, never the code itself."""
    return {
        "id": hashlib.sha256(code.encode("utf-8")).hexdigest(),
        "sub_type": "transit_code",
    }
