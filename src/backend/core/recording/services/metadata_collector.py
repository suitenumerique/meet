"""Meeting metadata collection service."""

from logging import getLogger

from django.conf import settings

from asgiref.sync import async_to_sync, sync_to_async
from livekit.protocol.agent_dispatch import (
    CreateAgentDispatchRequest,
)

from core import utils
from core.models import Recording

logger = getLogger(__name__)


class MetadataCollectorException(Exception):
    """Generic exception in the metadata collector."""


class MetadataCollectorService:
    """Service for dispatching and managing the metadata collector agent."""

    @async_to_sync
    async def start(self, recording: Recording):
        """Explicitly dispatch the metadata collector agent to a room."""

        lkapi = utils.create_livekit_client()
        room_id = str(recording.room.id)

        try:
            response = await lkapi.agent_dispatch.create_dispatch(
                CreateAgentDispatchRequest(
                    agent_name=settings.METADATA_COLLECTOR_AGENT_NAME,
                    room=room_id,
                    metadata=str(recording.id),
                )
            )
        except Exception as e:
            logger.exception(
                "Failed to create metadata collector agent for room %s", room_id
            )
            raise MetadataCollectorException(
                "Failed to create metadata collector agent"
            ) from e
        finally:
            await lkapi.aclose()

        dispatch_id = getattr(response, "id", None)

        if not dispatch_id:
            logger.error("LiveKit response missing dispatch ID for room %s", room_id)
            raise MetadataCollectorException(
                f"LiveKit did not return a dispatch_id for room {room_id}"
            )

        recording.options["metadata_collector_dispatch_id"] = dispatch_id
        await sync_to_async(recording.save)(update_fields=["options"])

        return dispatch_id

    @async_to_sync
    async def stop(self, recording: Recording):
        """Stop and delete the agent dispatch associated to the room."""

        room_id = str(recording.room.id)
        dispatch_id = recording.options.get("metadata_collector_dispatch_id")
        lkapi = utils.create_livekit_client()

        try:
            if not dispatch_id:
                logger.warning(
                    "No metadata collector dispatch ID stored for room %s", room_id
                )
                return None

            await lkapi.agent_dispatch.delete_dispatch(
                dispatch_id=str(dispatch_id), room_name=room_id
            )

        except Exception as e:
            logger.exception(
                "Failed to stop metadata collector agent dispatch for room %s",
                room_id,
            )
            raise MetadataCollectorException(
                f"Failed to stop metadata collector agent for room {room_id}"
            ) from e
        finally:
            await lkapi.aclose()
