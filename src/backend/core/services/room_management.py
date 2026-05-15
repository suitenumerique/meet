"""Room management service for LiveKit rooms."""

# pylint: disable=no-name-in-module

import json
from logging import getLogger
from typing import Dict, Optional

from asgiref.sync import async_to_sync
from livekit.api import (
    TwirpError,
    UpdateRoomMetadataRequest,
)

from core import utils

logger = getLogger(__name__)


class RoomManagementException(Exception):
    """Exception raised when a room management operation fails."""


class RoomNotFoundException(RoomManagementException):
    """Raised when the target room does not exist in LiveKit."""


class RoomManagement:
    """Service for managing LiveKit rooms."""

    @async_to_sync
    async def update_metadata(self, room_name: str, metadata: Optional[Dict] = None):
        """Update a LiveKit room's metadata.

        The `room_name` corresponds to the LiveKit room identifier
        (i.e. the Room model's UUID as a string).
        """

        lkapi = utils.create_livekit_client()

        try:
            await lkapi.room.update_room_metadata(
                UpdateRoomMetadataRequest(
                    room=room_name,
                    metadata=json.dumps(metadata) if metadata is not None else "",
                )
            )

        except TwirpError as e:
            if e.code == "not_found":
                logger.warning(
                    "Room %s not found in LiveKit, skipping metadata update",
                    room_name,
                )
                raise RoomNotFoundException("Room does not exist") from e

            logger.exception(
                "Unexpected error updating metadata for room %s",
                room_name,
            )
            raise RoomManagementException("Could not update room metadata") from e

        finally:
            await lkapi.aclose()
