"""Participants management service for LiveKit rooms."""

# pylint: disable=R0913,E0611,R0917
# ruff: noqa:PLR0913

import json
import uuid
from logging import getLogger

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
    async def mute(self, room_name, identity, track_sid):
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
    async def remove(self, room_name, identity):
        """Remove a participant from a room and clear their lobby cache."""

        LobbyService().clear_participant_cache(
            room_id=uuid.UUID(room_name), participant_id=identity
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
        room_name,
        identity,
        metadata=None,
        attributes=None,
        permission=None,
        name=None,
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
            raise ParticipantsManagementException(
                "Could not updating participant"
            ) from e

        finally:
            await lkapi.aclose()
