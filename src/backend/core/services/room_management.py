"""Room management service for LiveKit rooms."""

# pylint: disable=no-name-in-module

import json
from logging import getLogger
from typing import Dict, Optional

from django.conf import settings
from django.core.cache import cache

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

    @classmethod
    @async_to_sync
    async def update_metadata(
        cls,
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
                raise RoomNotFoundException("Room does not exist") from e

            logger.exception(
                "Unexpected error updating metadata for room %s",
                room_name,
            )
            raise RoomManagementException("Could not update room metadata") from e

        finally:
            await lkapi.aclose()

    @classmethod
    def get_participants(cls, room_name: str) -> dict:
        """Count the people in a LiveKit room and name the ones who gave a name.

        The two can differ: someone who joined without a display name is
        counted but not named. The answer is cached for
        ROOM_PARTICIPANTS_CACHE_SECONDS and one caller at a time refreshes it,
        so a meeting many are waiting on costs LiveKit one call per hold.

        Raises:
            RoomManagementException: the room could not be read.
        """
        hold = settings.ROOM_PARTICIPANTS_CACHE_SECONDS
        key = f"room_participants_{room_name:s}"

        # The lock holder refreshes the answer; the others read it, and ask
        # LiveKit themselves only while there is none yet.
        refresh = cache.add(f"{key:s}_lock", True, hold)
        answer = cache.get(key)

        if answer is None or refresh:
            try:
                answer = cls._list_participants(room_name)
            except RoomManagementException:
                # Cached as well: an unreachable LiveKit is when it can least
                # afford one call per poll.
                answer = False
            # Outlives the lock, so the callers it turns away have an answer.
            cache.set(key, answer, hold * 3)

        if answer is False:
            raise RoomManagementException("Could not list participants")

        return answer

    @staticmethod
    @async_to_sync
    async def _list_participants(room_name: str) -> dict:
        """Ask LiveKit who is in a room, leaving out bots and recorders."""
        lkapi = utils.create_livekit_client()

        try:
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

        # Otherwise an unreachable LiveKit is a 500 on every poll.
        except aiohttp.ClientError as e:
            logger.exception(
                "Could not reach LiveKit listing participants of %s", room_name
            )
            raise RoomManagementException("Could not list participants") from e

        finally:
            await lkapi.aclose()

        people = [p for p in response.participants if not _is_machine(p)]

        return {
            "count": len(people),
            "names": [p.name for p in people if p.name],
        }

    @classmethod
    @async_to_sync
    async def delete_room(cls, room_name: str):
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

    @classmethod
    def sync_room_metadata(cls, room):
        """Push a room's configuration and access level to its LiveKit room metadata.

        Failures are swallowed: a room that is not live yet, or a LiveKit hiccup,
        should never fail the request that triggered the update.
        """

        metadata = {
            "configuration": room.configuration,
            "access_level": room.access_level,
        }

        try:
            cls.update_metadata(
                room_name=str(room.id),
                metadata=metadata,
            )
        except RoomNotFoundException:
            logger.info(
                "LiveKit room %s does not exist yet, skipping metadata sync",
                room.id,
            )
        except RoomManagementException:
            logger.warning(
                "Failed to sync metadata to LiveKit for room %s",
                room.id,
            )
