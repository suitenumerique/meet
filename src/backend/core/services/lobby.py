"""Lobby Service"""

import json
import logging
import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from django.conf import settings
from django.core.cache import cache

from asgiref.sync import async_to_sync
from livekit.api import LiveKitAPI, SendDataRequest, TwirpError  # pylint: disable=E0611

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


class LobbyNotificationError(LobbyError):
    """Raised when LiveKit notification fails."""


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
    """

    @staticmethod
    def _get_cache_key(room_id: UUID, participant_id: str) -> str:
        """Generate cache key for participant(s) data."""
        return f"{settings.LOBBY_KEY_PREFIX}_{room_id!s}_{participant_id}"

    @staticmethod
    def _get_or_create_participant_id(request) -> str:
        """Extract unique participant identifier from the request."""
        return request.COOKIES.get(settings.LOBBY_COOKIE_NAME, uuid.uuid4().hex)

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
    def can_bypass_lobby(room, user) -> bool:
        """Determines if a user can bypass the waiting lobby and join a room directly.

        A user can bypass the lobby if:
        1. The room is public (open to everyone)
        2. The room has TRUSTED access level and the user is authenticated

        Note: Room access levels can change while participants are waiting in the lobby.
        This function only checks the current state and should be called each time
        a participant requests entry to ensure consistent access control, even for
        participants who have already begun waiting.
        """
        return room.is_public or (
            room.access_level == models.RoomAccessLevel.TRUSTED
            and user.is_authenticated
        )

    def request_entry(
        self,
        room,
        request,
        username: str,
    ) -> Tuple[LobbyParticipant, Optional[Dict]]:
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

        participant_id = self._get_or_create_participant_id(request)
        participant = self._get_participant(room.id, participant_id)

        if self.can_bypass_lobby(room=room, user=request.user):
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
                room_id=str(room.id),
                user=request.user,
                username=username,
                color=participant.color,
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
                room_id=str(room.id),
                user=request.user,
                username=username,
                color=participant.color,
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

    def enter(
        self, room_id: UUID, participant_id: str, username: str
    ) -> LobbyParticipant:
        """Add participant to waiting lobby.

        Create a new participant entry in waiting status and notify room
        participants of the new entry request.

        Raises:
            LobbyNotificationError: If room notification fails
        """

        color = utils.generate_color(participant_id)

        participant = LobbyParticipant(
            status=LobbyParticipantStatus.WAITING,
            username=username,
            id=participant_id,
            color=color,
        )

        try:
            self.notify_participants(room_id=room_id)
        except LobbyNotificationError:
            # If room not created yet, there is no participants to notify
            pass

        cache_key = self._get_cache_key(room_id, participant_id)
        cache.set(
            cache_key,
            participant.to_dict(),
            timeout=settings.LOBBY_WAITING_TIMEOUT,
        )

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

        notification_data = {
            "type": settings.LOBBY_NOTIFICATION_TYPE,
        }

        lkapi = LiveKitAPI(**settings.LIVEKIT_CONFIGURATION)
        try:
            await lkapi.room.send_data(
                SendDataRequest(
                    room=str(room_id),
                    data=json.dumps(notification_data).encode("utf-8"),
                    kind="RELIABLE",
                )
            )
        except TwirpError as e:
            logger.exception("Failed to notify room participants")
            raise LobbyNotificationError("Failed to notify room participants") from e
        finally:
            await lkapi.aclose()

    def clear_room_cache(self, room_id: UUID) -> None:
        """Clear all participant entries from the cache for a specific room."""

        pattern = self._get_cache_key(room_id, "*")
        keys = cache.keys(pattern)

        if not keys:
            return

        cache.delete_many(keys)
