"""Room management service for LiveKit rooms."""

# pylint: disable=no-name-in-module

import asyncio
import json
from logging import getLogger
from typing import Dict, Optional

from django.conf import settings

import aiohttp
from asgiref.sync import async_to_sync
from livekit.api import (
    DeleteRoomRequest,
    ListParticipantsRequest,
    ListRoomsRequest,
    TwirpError,
    UpdateRoomMetadataRequest,
)
from livekit.protocol.models import ParticipantInfo

from core import utils

logger = getLogger(__name__)

# How many names one answer carries, matching the join screen's own cap.
MAX_NAMES = 5


def _is_machine(participant: ParticipantInfo) -> bool:
    """Whether this participant is a bot or a recorder rather than a person.

    A recorder connects to the room the way a browser does, so LiveKit lists it
    beside the people and the join screen would count it as one. The three fields
    below are the ones LiveKit's own IsDependent reads for the same decision.
    """
    return (
        participant.kind in (ParticipantInfo.Kind.AGENT, ParticipantInfo.Kind.EGRESS)
        or participant.permission.agent
        or participant.permission.recorder
    )


class RoomManagementException(Exception):
    """Exception raised when a room management operation fails."""


class RoomNotFoundException(RoomManagementException):
    """Raised when the target room does not exist in LiveKit."""


class RoomManagement:
    """Service for managing LiveKit rooms."""

    @async_to_sync
    async def update_metadata(
        self,
        room_name: str,
        metadata: Optional[Dict] = None,
        remove_keys: Optional[list[str]] = None,
    ):
        """Merge values into a LiveKit room's metadata.

        The `room_name` corresponds to the LiveKit room identifier
        (i.e. the Room model's UUID as a string).

        Raises:
            RoomNotFoundException: the room does not exist in LiveKit.
            RoomManagementException: the metadata update otherwise fails.
        """

        lkapi = utils.create_livekit_client()

        try:
            response = await lkapi.room.list_rooms(ListRoomsRequest(names=[room_name]))

            if not response.rooms:
                logger.warning(
                    "Room %s not found in LiveKit, skipping metadata update",
                    room_name,
                )
                raise RoomNotFoundException("Room does not exist")

            existing_metadata = json.loads(response.rooms[0].metadata or "{}")

            for key in remove_keys or []:
                existing_metadata.pop(key, None)

            updated_metadata = {**existing_metadata, **(metadata or {})}

            await lkapi.room.update_room_metadata(
                UpdateRoomMetadataRequest(
                    room=room_name,
                    metadata=json.dumps(updated_metadata),
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

    @async_to_sync
    async def get_participants(self, room_name: str) -> dict:
        """Count the people in a LiveKit room and name the ones who gave a name.

        The two can differ: someone who joined without a display name is
        counted but not named.

        Raises:
            RoomManagementException: the room could not be read.
        """

        lkapi = utils.create_livekit_client()

        try:
            # The timeout has to wrap the call: the SDK passes timeout=None to
            # aiohttp, so the client's own is ignored and a LiveKit that goes
            # quiet holds one of the three workers until it answers.
            async with asyncio.timeout(settings.ROOM_PARTICIPANTS_TIMEOUT_SECONDS):
                response = await lkapi.room.list_participants(
                    ListParticipantsRequest(room=room_name)
                )

        except TwirpError as e:
            if e.code == "not_found":
                # LiveKit creates a room when its first participant joins, so a
                # name it does not know has nobody in it.
                return {"count": 0, "names": []}

            logger.exception("Unexpected error listing participants of %s", room_name)
            raise RoomManagementException("Could not list participants") from e

        # An unreachable LiveKit would otherwise surface as a 500 on every poll
        # of the join screen, so it fails the same way as a refusal. Giving up
        # raises TimeoutError, which is no kind of ClientError.
        except (aiohttp.ClientError, TimeoutError) as e:
            logger.exception(
                "Could not reach LiveKit listing participants of %s", room_name
            )
            raise RoomManagementException("Could not list participants") from e

        finally:
            await lkapi.aclose()

        people = [p for p in response.participants if not _is_machine(p)]
        names = [p.name for p in people if p.name]

        # The join screen names a handful and counts the rest, so the rest is
        # bytes on every poll that nobody reads.
        return {"count": len(people), "names": names[:MAX_NAMES]}

    @async_to_sync
    async def delete_room(self, room_name: str):
        """Delete a LiveKit room and disconnect all participants.

        Raises:
            RoomNotFoundException: the room does not exist in LiveKit.
            RoomManagementException: the deletion otherwise fails.
        """

        lkapi = utils.create_livekit_client()

        try:
            await lkapi.room.delete_room(DeleteRoomRequest(room=room_name))
            logger.info("Deleted LiveKit room %s", room_name)
        except TwirpError as e:
            if e.code == "not_found":
                logger.warning(
                    "Room %s not found in LiveKit, skipping deletion",
                    room_name,
                )
                raise RoomNotFoundException("Room does not exist") from e

            logger.exception("Unexpected error deleting room %s", room_name)
            raise RoomManagementException("Could not delete room") from e
        finally:
            await lkapi.aclose()
