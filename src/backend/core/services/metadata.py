"""Service for managing metadata agents in LiveKit rooms."""

import json
import logging
from logging import getLogger

from django.conf import settings

from asgiref.sync import async_to_sync
from livekit.protocol.agent_dispatch import (
    CreateAgentDispatchRequest,
)

from core import utils

logging.basicConfig(level=logging.DEBUG)

logger = getLogger(__name__)


class MetadataException(Exception):
    """Exception raised when metadata operations fail."""


class MetadataService:
    """Service for managing metadata agents in LiveKit rooms."""

    def __init__(self) -> None:
        self.agent_name = settings.ROOM_METADATA_AGENT_NAME

    @async_to_sync
    async def start_metadata(self, room, recording_id) -> None:
        """Start metadata agent in the specified room."""

        lkapi = utils.create_livekit_client()
        try:
            payload = (
                json.dumps({"recording_id": str(recording_id)})
                if recording_id
                else None
            )

            resp = await lkapi.agent_dispatch.create_dispatch(
                CreateAgentDispatchRequest(
                    agent_name=self.agent_name,
                    room=str(room.id),
                    metadata=payload,
                )
            )
            dispatch_id = resp.id
            dispatch_id = getattr(resp, "id", None)
            if not dispatch_id:
                raise MetadataException("LiveKit did not return a dispatch_id")
            logger.info(
                "Agent dispatch created: room=%s agent=%s dispatch_id=%s",
                room.id,
                self.agent_name,
                dispatch_id,
            )
            return dispatch_id
        except Exception as e:
            logger.exception("Failed to create agent dispatch for room %s", room.id)
            raise MetadataException("Failed to create metadata agent") from e
        finally:
            await lkapi.aclose()

    @async_to_sync
    async def stop_metadata(self, room, dispatch_id) -> None:
        """Stop metadata agent in the specified room."""
        logger.info(
            "deleting agent dispatch: room=%s agent=%s dispatch_id=%s",
            room.id,
            self.agent_name,
            dispatch_id,
        )
        lkapi = utils.create_livekit_client()
        try:
            await lkapi.agent_dispatch.delete_dispatch(
                dispatch_id=str(dispatch_id), room_name=str(room.id)
            )
            logger.info(
                "Agent dispatch deleted: room=%s agent=%s", room.id, self.agent_name
            )
        except Exception as e:
            logger.exception("Failed to delete agent dispatch for room %s", room.id)
            raise MetadataException("Failed to stop metadata agent") from e
        finally:
            await lkapi.aclose()
