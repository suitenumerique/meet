"""Wip."""

from logging import getLogger

from django.conf import settings

from asgiref.sync import async_to_sync
from livekit.protocol.agent_dispatch import (
    CreateAgentDispatchRequest,
)

from core import utils

logger = getLogger(__name__)


class MetadataExtractorException(Exception):
    """Wip."""


class MetadataExtractorService:
    """Wip."""

    @async_to_sync
    async def start(self, recording):
        """Wip."""

        lkapi = utils.create_livekit_client()
        room_id = str(recording.room.id)

        try:
            response = await lkapi.agent_dispatch.create_dispatch(
                CreateAgentDispatchRequest(
                    agent_name=settings.ROOM_METADATA_EXTRACTOR_AGENT_NAME,
                    room=room_id,
                    metadata=str(recording.id),
                )
            )
        except Exception as e:
            logger.exception(
                "Failed to create metadata extractor agent for room %s", room_id
            )
            raise MetadataExtractorException(
                "Failed to create metadata extractor agent"
            ) from e
        finally:
            await lkapi.aclose()

        dispatch_id = getattr(response, "id", None)

        if not dispatch_id:
            logger.error("LiveKit response missing dispatch ID for room %s", room_id)
            raise MetadataExtractorException(
                f"LiveKit did not return a dispatch_id for room {room_id}"
            )

        return dispatch_id

    @async_to_sync
    async def stop(self, recording):
        """Wip."""

        room_name = str(recording.room.id)
        lkapi = utils.create_livekit_client()

        try:
            dispatches = await lkapi.agent_dispatch.list_dispatch(room_name=room_name)

            dispatch_id = next(
                (
                    d.id
                    for d in dispatches
                    if d.agent_name == settings.ROOM_METADATA_EXTRACTOR_AGENT_NAME
                ),
                None,
            )

            if not dispatch_id:
                logger.warning(
                    "No metadata extractor agent found for room %s", room_name
                )
                return None

            await lkapi.agent_dispatch.delete_dispatch(
                dispatch_id=str(dispatch_id), room_name=room_name
            )

        except Exception as e:
            logger.exception(
                "Failed to stop metadata extractor agent dispatch for room %s",
                room_name,
            )
            raise MetadataExtractorException(
                f"Failed to stop metadata metadata extractor agent for room {room_name}"
            ) from e
        finally:
            await lkapi.aclose()
