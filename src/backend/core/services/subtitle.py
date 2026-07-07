"""Service for managing subtitle agents in LiveKit rooms."""

from logging import getLogger

from django.conf import settings

from asgiref.sync import async_to_sync
from livekit.api import RoomParticipantIdentity
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
        """Stop the native subtitle agent for a room (best-effort, idempotent).

        Native captions are ROOM-WIDE (one agent per room), so this tears down
        the pipeline for ALL participants. Two levers, both room-scoped to
        ``str(room.id)`` and safe to call when the agent is already gone:
        - delete every agent dispatch for ``ROOM_SUBTITLE_AGENT_NAME`` in the room;
        - evict the hidden agent participant ``f"{AGENT_NAME}-{room.id}"``.

        A failure of either lever is logged and swallowed (non-fatal): callers
        only want best-effort teardown.
        """

        room_name = str(room.id)
        agent_name = settings.ROOM_SUBTITLE_AGENT_NAME
        lkapi = utils.create_livekit_client()

        try:
            # Delete the dispatch(es) that spawned the agent for this room.
            try:
                dispatches = await lkapi.agent_dispatch.list_dispatch(
                    room_name=room_name
                )
                for dispatch in dispatches:
                    if dispatch.agent_name != agent_name:
                        continue
                    await lkapi.agent_dispatch.delete_dispatch(
                        dispatch_id=dispatch.id, room_name=room_name
                    )
            except Exception:  # noqa: BLE001 — best-effort teardown, never raise
                logger.warning(
                    "Failed to delete subtitle agent dispatch(es) for room %s",
                    room_name,
                    exc_info=True,
                )

            # Evict the hidden agent participant (covers an agent still present
            # even when no dispatch remains). Not-found is a no-op → idempotent.
            try:
                await lkapi.room.remove_participant(
                    RoomParticipantIdentity(
                        room=room_name, identity=f"{agent_name}-{room_name}"
                    )
                )
            except Exception:  # noqa: BLE001 — best-effort teardown, never raise
                logger.warning(
                    "Failed to evict subtitle agent participant for room %s",
                    room_name,
                    exc_info=True,
                )

        finally:
            await lkapi.aclose()
