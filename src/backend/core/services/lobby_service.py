"""Lobby Service"""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from django.conf import settings
from django.core.cache import cache

import aiohttp
from asgiref.sync import async_to_sync
from livekit import api as livekit_api
from livekit.api import room_service as room_service_api

from core import utils

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


class LobbyNotificationError(LobbyError):
    """Raised when LiveKit notification fails."""


@dataclass
class LobbyParticipant:
    """Participant in a lobby system."""

    status: LobbyParticipantStatus
    username: str
    id: str

    def to_dict(self) -> Dict[str, str]:
        """Serialize the participant object to a dict representation."""
        return {"status": self.status.value, "username": self.username, "id": self.id}

    @classmethod
    def from_dict(cls, data: dict) -> "LobbyParticipant":
        """Create a LobbyParticipant instance from a dictionary."""
        try:
            status = LobbyParticipantStatus(
                data.get("status", LobbyParticipantStatus.UNKNOWN.value)
            )
            return cls(status=status, username=data["username"], id=data["id"])
        except (KeyError, ValueError) as e:
            logger.exception("Error creating Participant from dict:")
            raise LobbyParticipantParsingError("Invalid participant data") from e


class LobbyService:
    """Service for managing participant access through a lobby system.

    Handles participant entry requests, status management, and notifications
    using Redis cache for state management and LiveKit for real-time updates.
    """

    @staticmethod
    def _get_cache_key(room_id: UUID, participant_id: str) -> str:
        """Generate cache key for participant(s) data."""
        return f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_{participant_id}"

    @staticmethod
    def get_participant_id(request) -> str:
        """Extract unique participant identifier from the request."""
        return (
            str(request.user.id)
            if request.user.is_authenticated
            else request.COOKIES.get(settings.SESSION_COOKIE_NAME)
        )

    def request_entry(
        self,
        room_id: UUID,
        user,
        participant_id: str,
        username: str,
    ) -> Tuple[LobbyParticipantStatus, Optional[Dict]]:
        """Request entry to a room for a participant.

        This usual status transitions is:
        UNKNOWN -> WAITING -> (ACCEPTED | DENIED)

        Flow:
        1. Check current status
        2. If waiting, refresh timeout to maintain position
        3. If unknown, add to waiting list
        4. If accepted, generate LiveKit config
        5. If denied, do nothing.
        """

        status = self.check_status(room_id, participant_id)

        if status == LobbyParticipantStatus.WAITING:
            self.refresh_waiting_status(room_id, participant_id)

        if status == LobbyParticipantStatus.UNKNOWN:
            self.enter(room_id, participant_id, username)
            status = LobbyParticipantStatus.WAITING

        livekit_config = None
        if status == LobbyParticipantStatus.ACCEPTED:
            # wrongly named, contains access token to join a room
            livekit_config = utils.generate_livekit_config(
                room_id=str(room_id), user=user, username=username
            )

        return status, livekit_config

    def refresh_waiting_status(self, room_id: UUID, participant_id: str):
        """Refresh timeout for waiting participant.

        Extends the waiting period for a participant to maintain their position
        in the lobby queue. Automatic removal if the participant is not
        actively checking their status.
        """
        cache.touch(
            self._get_cache_key(room_id, participant_id), settings.LOBBY_WAITING_TIMEOUT
        )

    def enter(self, room_id: UUID, participant_id: str, username: str) -> None:
        """Add participant to waiting lobby.

        Create a new participant entry in waiting status and notify room
        participants of the new entry request.

        Raises:
            LobbyNotificationError: If room notification fails
        """
        participant = LobbyParticipant(
            status=LobbyParticipantStatus.WAITING, username=username, id=participant_id
        )

        cache_key = self._get_cache_key(room_id, participant_id)
        cache.set(
            cache_key,
            participant.to_dict(),
            timeout=settings.LOBBY_WAITING_TIMEOUT,
        )

        try:
            self.notify_participants(room_id=room_id)
        except LobbyNotificationError:
            # If room not created yet, there is no participants to notify
            pass

    def check_status(
        self, room_id: UUID, participant_id: str
    ) -> LobbyParticipantStatus:
        """Check participant's current status in the lobby."""

        cache_key = self._get_cache_key(room_id, participant_id)
        data = cache.get(cache_key)

        if not data:
            return LobbyParticipantStatus.UNKNOWN

        try:
            participant = LobbyParticipant.from_dict(data)
            return participant.status
        except LobbyParticipantParsingError:
            logger.error("Corrupted participant data found and removed: %s", cache_key)
            cache.delete(cache_key)
            return LobbyParticipantStatus.UNKNOWN

    def list_waiting_participants(self, room_id: UUID) -> List[dict]:
        """List all waiting participants for a room."""

        pattern = self._get_cache_key(room_id, "*")
        keys = cache.keys(pattern)

        if not keys:
            return []

        data = cache.get_many(keys)

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

    @async_to_sync
    async def notify_participants(self, room_id: UUID):
        """Notify room participants about a new waiting participant using LiveKit.

        Raises:
            LobbyNotificationError: If notification fails to send
        """

        # Use HTTP connector for local development with Tilt,
        # where cluster communications are unsecure
        connector = aiohttp.TCPConnector(ssl=settings.LIVEKIT_VERIFY_SSL)
        async with aiohttp.ClientSession(connector=connector) as session:
            room_service = room_service_api.RoomService(
                session, **settings.LIVEKIT_CONFIGURATION
            )
            try:
                await room_service.send_data(
                    room_service_api.SendDataRequest(
                        room=str(room_id),
                        data=settings.LOBBY_NOTIFICATION_MSG.encode("utf-8"),
                        kind="RELIABLE",
                    )
                )
            except livekit_api.TwirpError as e:
                logger.exception("Failed to notify room participants")
                raise LobbyNotificationError(
                    "Failed to notify room participants"
                ) from e
