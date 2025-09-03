"""Participants management service for LiveKit rooms."""

# pylint: disable=too-many-arguments,no-name-in-module,too-many-positional-arguments
# ruff: noqa:PLR0913

import json
import uuid
from logging import getLogger
from typing import Dict, Optional

from asgiref.sync import async_to_sync
from livekit.api import (
    MuteRoomTrackRequest,
    RoomParticipantIdentity,
    TwirpError,
    UpdateParticipantRequest,
)

from core import utils

from .lobby import LobbyService

logger = getLogger(__name__)


class ParticipantsManagementException(Exception):
    """Exception raised when a participant management operations fail."""


class ParticipantsManagement:
    """Service for managing participants."""

    @async_to_sync
    async def mute(self, room_name: str, identity: str, track_sid: str):
        """Mute a specific audio or video track for a participant in a room."""

        lkapi = utils.create_livekit_client()

        try:
            await lkapi.room.mute_published_track(
                MuteRoomTrackRequest(
                    room=room_name,
                    identity=identity,
                    track_sid=track_sid,
                    muted=True,
                )
            )

        except TwirpError as e:
            logger.exception(
                "Unexpected error muting participant %s for room %s",
                identity,
                room_name,
            )
            raise ParticipantsManagementException("Could not mute participant") from e

        finally:
            await lkapi.aclose()

    @async_to_sync
    async def remove(self, room_name: str, identity: str):
        """Remove a participant from a room and clear their lobby cache."""

        try:
            LobbyService().clear_participant_cache(
                room_id=uuid.UUID(room_name), participant_id=identity
            )
        except (ValueError, TypeError) as exc:
            logger.warning(
                "participants_management.remove: room_name '%s' is not a UUID; "
                "skipping lobby cache clear",
                room_name,
                exc_info=exc,
            )

        lkapi = utils.create_livekit_client()

        try:
            await lkapi.room.remove_participant(
                RoomParticipantIdentity(room=room_name, identity=identity)
            )
        except TwirpError as e:
            logger.exception(
                "Unexpected error removing participant %s for room %s",
                identity,
                room_name,
            )
            raise ParticipantsManagementException("Could not remove participant") from e

        finally:
            await lkapi.aclose()

    @async_to_sync
    async def update(
        self,
        room_name: str,
        identity: str,
        metadata: Optional[Dict] = None,
        attributes: Optional[Dict] = None,
        permission: Optional[Dict] = None,
        name: Optional[str] = None,
    ):
        """Update participant properties such as metadata, attributes, permissions, or name."""

        lkapi = utils.create_livekit_client()

        try:
            await lkapi.room.update_participant(
                UpdateParticipantRequest(
                    room=room_name,
                    identity=identity,
                    metadata=json.dumps(metadata),
                    permission=permission,
                    attributes=attributes,
                    name=name,
                )
            )

        except TwirpError as e:
            logger.exception(
                "Unexpected error updating participant %s for room %s",
                identity,
                room_name,
            )
            raise ParticipantsManagementException("Could not update participant") from e

        finally:
            await lkapi.aclose()
