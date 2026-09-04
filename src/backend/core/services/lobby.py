"""Lobby Service"""

import logging
import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from django.conf import settings
from django.core.cache import cache

from core import models, utils

logger = logging.getLogger(__name__)


class LobbyParticipantStatus(Enum):
    """Possible states of a participant in the lobby system.
    Values are lowercase strings for consistent serialization and API responses.
    """

    UNKNOWN = "unknown"
    WAITING = "waiting"
    ACCEPTED = "accepted"
    DENIED = "denied"


class LobbyError(Exception):
    """Base exception for lobby-related errors."""


class LobbyParticipantParsingError(LobbyError):
    """Raised when participant data parsing fails."""


class LobbyParticipantNotFound(LobbyError):
    """Raised when participant is not found."""


@dataclass
class LobbyParticipant:
    """Participant in a lobby system."""

    status: LobbyParticipantStatus
    username: str
    color: str
    id: str

    def to_dict(self) -> Dict[str, str]:
        """Serialize the participant object to a dict representation."""
        return {
            "status": self.status.value,
            "username": self.username,
            "id": self.id,
            "color": self.color,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "LobbyParticipant":
        """Create a LobbyParticipant instance from a dictionary."""
        try:
            status = LobbyParticipantStatus(
                data.get("status", LobbyParticipantStatus.UNKNOWN.value)
            )
            return cls(
                status=status,
                username=data["username"],
                id=data["id"],
                color=data["color"],
            )
        except (KeyError, ValueError) as e:
            logger.exception("Error creating Participant from dict:")
            raise LobbyParticipantParsingError("Invalid participant data") from e


class LobbyService:
    """Service for managing participant access through a lobby system.

    Handles participant entry requests, status management, and notifications
    using cache for state management and LiveKit for real-time updates.

    Participant membership per room is tracked in a native Redis SET (the
    "room index") so that listing and clearing a room's lobby never scans
    the shared keyspace. The per-participant cache entries remain the source
    of truth for state: their TTLs implement liveness (a waiter who stops
    polling simply expires). The index only records which participant ids
    may exist for a room; a stale id costs one cache miss and is pruned
    lazily.
    """

    @staticmethod
    def _get_cache_key(room_id: UUID, participant_id: str) -> str:
        """Generate cache key for participant(s) data."""
        return f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_{participant_id}"

    @staticmethod
    def _get_index_key(room_id: UUID) -> str:
        """Raw Redis key of the per-room participant index (a native SET).

        Built through django-redis' make_key so it lives under the same
        KEY_PREFIX/version namespace as the participant entries.
        """
        return cache.client.make_key(f"{settings.LOBBY_KEY_PREFIX}-index_{room_id!s}")

    @staticmethod
    def _redis(write: bool = True):
        """Raw redis-py client.

        SADD/SREM/SMEMBERS are not exposed by the Django cache API; this is
        the documented django-redis escape hatch.
        """
        return cache.client.get_client(write=write)

    def _index_add(self, room_id: UUID, participant_id: str) -> None:
        """Record a participant id in the room index.

        Refreshes a backstop TTL on the index so an abandoned room cannot
        leak its set beyond the longest participant timeout.
        """
        index_key = self._get_index_key(room_id)
        pipe = self._redis().pipeline(transaction=False)
        pipe.sadd(index_key, participant_id)
        pipe.expire(index_key, settings.LOBBY_ACCEPTED_TIMEOUT)
        pipe.execute()

    def _index_members(self, room_id: UUID) -> List[str]:
        """All participant ids currently indexed for the room."""
        members = self._redis(write=False).smembers(self._get_index_key(room_id))
        return [
            member.decode() if isinstance(member, bytes) else member
            for member in members
        ]

    def _index_touch(self, room_id: UUID) -> None:
        """Re-arm the room index backstop TTL.

        Called whenever a participant entry is written or refreshed so the
        index always outlives every entry it references — including a lone
        waiter whose rolling WAITING TTL would otherwise outlast the
        backstop set at enter() time.
        """
        self._redis().expire(
            self._get_index_key(room_id), settings.LOBBY_ACCEPTED_TIMEOUT
        )

    def _index_remove(self, room_id: UUID, *participant_ids: str) -> None:
        """Drop participant ids from the room index."""
        if participant_ids:
            self._redis().srem(self._get_index_key(room_id), *participant_ids)

    @staticmethod
    def _get_or_create_participant_id(request) -> str:
        """Extract unique participant identifier from the request."""
        return request.COOKIES.get(settings.LOBBY_COOKIE_NAME, str(uuid.uuid4()))

    @staticmethod
    def prepare_response(response, participant_id):
        """Set participant cookie if needed."""
        if not response.cookies.get(settings.LOBBY_COOKIE_NAME):
            response.set_cookie(
                key=settings.LOBBY_COOKIE_NAME,
                value=participant_id,
                httponly=True,
                secure=True,
                samesite="Lax",
            )

    @staticmethod
    def can_bypass_lobby(room, user, role) -> bool:
        """Determines if a user can bypass the waiting lobby and join a room directly.

        A user can bypass the lobby if:
        1. The room is public (open to everyone)
        2. The room has TRUSTED access level and the user is authenticated
        2. The room has RESTRICTED access level and the user has any role

        Note: Room access levels can change while participants are waiting in the lobby.
        This function only checks the current state and should be called each time
        a participant requests entry to ensure consistent access control, even for
        participants who have already begun waiting.
        """
        return (
            room.is_public
            or (
                room.access_level == models.RoomAccessLevel.TRUSTED
                and user.is_authenticated
            )
            or (
                room.access_level == models.RoomAccessLevel.RESTRICTED
                and user.is_authenticated
                and role is not None
            )
        )

    def request_entry(
        self,
        room: models.Room,
        request,
        username: str,
    ) -> Tuple[LobbyParticipant, Optional[Dict]]:
        """Request entry to a room for a participant.

        The usual status transitions are:
        UNKNOWN -> WAITING -> (ACCEPTED | DENIED)

        Flow:
        1. Check current status
        2. If waiting, refresh timeout to maintain position
        3. If unknown, add to waiting list
        4. If accepted, generate LiveKit config
        5. If denied, do nothing.
        """

        participant_id = self._get_or_create_participant_id(request)
        participant = self._get_participant(room.id, participant_id)

        room_id = str(room.id)
        user_role = room.get_role(request.user)

        if self.can_bypass_lobby(room=room, user=request.user, role=user_role):
            if participant is None:
                participant = LobbyParticipant(
                    status=LobbyParticipantStatus.ACCEPTED,
                    username=username,
                    id=participant_id,
                    color=utils.generate_color(participant_id),
                )
            else:
                participant.status = LobbyParticipantStatus.ACCEPTED

            livekit_config = utils.generate_livekit_config(
                room_id=room_id,
                user=request.user,
                username=username,
                color=participant.color,
                configuration=room.configuration,
                participant_id=participant_id,
                role=user_role,
            )
            return participant, livekit_config

        livekit_config = None

        if participant is None:
            participant = self.enter(room.id, participant_id, username)

        elif participant.status == LobbyParticipantStatus.WAITING:
            self.refresh_waiting_status(room.id, participant_id)

        elif participant.status == LobbyParticipantStatus.ACCEPTED:
            # wrongly named, contains access token to join a room
            livekit_config = utils.generate_livekit_config(
                room_id=room_id,
                user=request.user,
                username=username,
                color=participant.color,
                configuration=room.configuration,
                participant_id=participant_id,
                role=user_role,
            )

        return participant, livekit_config

    def refresh_waiting_status(self, room_id: UUID, participant_id: str):
        """Refresh timeout for waiting participant.

        Extends the waiting period for a participant to maintain their position
        in the lobby queue. Automatic removal if the participant is not
        actively checking their status.
        """
        cache.touch(
            self._get_cache_key(room_id, participant_id), settings.LOBBY_WAITING_TIMEOUT
        )
        self._index_touch(room_id)

    def enter(
        self, room_id: UUID, participant_id: str, username: str
    ) -> LobbyParticipant:
        """Add participant to waiting lobby.

        Create a new participant entry in waiting status, index the
        participant id for the room, and notify room participants of the
        new entry request.
        """

        color = utils.generate_color(participant_id)

        participant = LobbyParticipant(
            status=LobbyParticipantStatus.WAITING,
            username=username,
            id=participant_id,
            color=color,
        )

        try:
            utils.notify_participants(
                room_name=str(room_id),
                notification_data={
                    "type": settings.LOBBY_NOTIFICATION_TYPE,
                },
            )
        except utils.NotificationError:
            # If room not created yet, there is no participants to notify
            logger.exception("Failed to notify room participants")

        cache_key = self._get_cache_key(room_id, participant_id)
        cache.set(
            cache_key,
            participant.to_dict(),
            timeout=settings.LOBBY_WAITING_TIMEOUT,
        )
        self._index_add(room_id, participant_id)

        return participant

    def _get_participant(
        self, room_id: UUID, participant_id: str
    ) -> Optional[LobbyParticipant]:
        """Check participant's current status in the lobby."""

        cache_key = self._get_cache_key(room_id, participant_id)
        data = cache.get(cache_key)

        if not data:
            return None

        try:
            return LobbyParticipant.from_dict(data)
        except LobbyParticipantParsingError:
            logger.error("Corrupted participant data found and removed: %s", cache_key)
            cache.delete(cache_key)
            return None

    def list_waiting_participants(self, room_id: UUID) -> List[dict]:
        """List all waiting participants for a room.

        Reads the per-room index (O(participants of this room)) instead of
        scanning the shared keyspace. Indexed ids whose cache entry has
        expired are pruned lazily here: the entry TTL is the liveness
        protocol, so a missing entry means the participant is gone.
        """

        member_ids = self._index_members(room_id)

        if not member_ids:
            return []

        keys_by_id = {
            participant_id: self._get_cache_key(room_id, participant_id)
            for participant_id in member_ids
        }
        data = cache.get_many(list(keys_by_id.values()))

        dead_ids = [
            participant_id
            for participant_id, cache_key in keys_by_id.items()
            if cache_key not in data
        ]
        self._index_remove(room_id, *dead_ids)

        waiting_participants = []
        for cache_key, raw_participant in data.items():
            try:
                participant = LobbyParticipant.from_dict(raw_participant)
            except LobbyParticipantParsingError:
                cache.delete(cache_key)
                continue
            if participant.status == LobbyParticipantStatus.WAITING:
                waiting_participants.append(participant.to_dict())

        return waiting_participants

    def handle_participant_entry(
        self,
        room_id: UUID,
        participant_id: str,
        allow_entry: bool,
    ) -> None:
        """Handle decision on participant entry.

        Updates participant status based on allow_entry:
        - If accepted: ACCEPTED status with extended timeout matching LiveKit token
        - If denied: DENIED status with short timeout allowing status check and retry
        """
        if allow_entry:
            decision = {
                "status": LobbyParticipantStatus.ACCEPTED,
                "timeout": settings.LOBBY_ACCEPTED_TIMEOUT,
            }
        else:
            decision = {
                "status": LobbyParticipantStatus.DENIED,
                "timeout": settings.LOBBY_DENIED_TIMEOUT,
            }

        self._update_participant_status(room_id, participant_id, **decision)

    def _update_participant_status(
        self,
        room_id: UUID,
        participant_id: str,
        status: LobbyParticipantStatus,
        timeout: int,
    ) -> None:
        """Update participant status with appropriate timeout."""

        cache_key = self._get_cache_key(room_id, participant_id)

        data = cache.get(cache_key)
        if not data:
            logger.error("Participant %s not found", participant_id)
            raise LobbyParticipantNotFound("Participant not found")

        try:
            participant = LobbyParticipant.from_dict(data)
        except LobbyParticipantParsingError:
            logger.exception(
                "Removed corrupted data for participant %s:", participant_id
            )
            cache.delete(cache_key)
            raise

        participant.status = status
        cache.set(cache_key, participant.to_dict(), timeout=timeout)
        self._index_touch(room_id)

    def clear_room_cache(self, room_id: UUID) -> None:
        """Clear all participant entries from the cache for a specific room.

        Deletes the indexed participant entries and the index itself with
        targeted commands instead of a full-keyspace pattern scan.
        """

        member_ids = self._index_members(room_id)
        if member_ids:
            cache.delete_many(
                [
                    self._get_cache_key(room_id, participant_id)
                    for participant_id in member_ids
                ]
            )
        self._redis().delete(self._get_index_key(room_id))

    def clear_participant_cache(self, room_id: UUID, participant_id: str) -> None:
        """Clear a given participant entry from the cache for a specific room."""

        cache_key = self._get_cache_key(room_id, participant_id)
        cache.delete(cache_key)
        self._index_remove(room_id, participant_id)
