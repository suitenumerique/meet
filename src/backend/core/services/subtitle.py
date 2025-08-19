"""Service for managing subtitle agents in LiveKit rooms."""

from logging import getLogger

from django.conf import settings

from asgiref.sync import async_to_sync
from livekit.protocol.agent_dispatch import CreateAgentDispatchRequest

from core import utils

logger = getLogger(__name__)


class SubtitleException(Exception):
    """Exception raised when subtitle operations fail."""


class SubtitleService:
    """Service for managing subtitle agents in LiveKit rooms."""

    @async_to_sync
    async def start_subtitle(self, room):
        """Start subtitle agent for the specified room."""

        lkapi = utils.create_livekit_client()

        try:
            # Transcriber agent prevents duplicate subtitle agents per room
            # No error is raised if agent already exists
            await lkapi.agent_dispatch.create_dispatch(
                CreateAgentDispatchRequest(
                    agent_name=settings.ROOM_SUBTITLE_AGENT_NAME, room=str(room.id)
                )
            )
        except Exception as e:
            logger.exception("Failed to create agent dispatch for room %s", room.id)
            raise SubtitleException("Failed to create subtitle agent") from e

        finally:
            await lkapi.aclose()

    @async_to_sync
    async def stop_subtitle(self, room) -> None:
        """Stop subtitle agent for the specified room."""

        raise NotImplementedError("Subtitle agent stopping not yet implemented")
