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


def _is_machine(participant: ParticipantInfo) -> bool:
    """Check whether a participant is a recorder or an agent rather than a person.

    The three clauses mirror LiveKit's own IsDependent, which is what decides
    whether a participant counts toward the total it reports for a room. The
    grants are checked as well as the kind because an egress worker can carry
    the grant without the kind.
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

        The count and the names can differ: someone who joined without a display
        name is one of the people in the room and is named by nobody.

        Raises:
            RoomManagementException: the room could not be read.
        """

        lkapi = utils.create_livekit_client()

        try:
            # The join screen reaches this without anyone clicking anything, and
            # the deployment runs three synchronous workers, so a LiveKit that
            # accepts the connection and then says nothing must not hold one.
            # The clock has to be here: the SDK passes timeout=None to aiohttp
            # on every call, which overrides whatever the session was given and
            # leaves the request with no timeout at all.
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

        return {
            "count": len(people),
            "names": [person.name for person in people if person.name],
        }

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
