"""Room management service for LiveKit rooms."""

# pylint: disable=no-name-in-module

import asyncio
import contextlib
import json
from logging import getLogger
from typing import Dict, Optional

from django.core.cache import cache

import aiohttp
from asgiref.sync import async_to_sync
from livekit.api import (
    DeleteRoomRequest,
    EgressStatus,
    ListEgressRequest,
    ListRoomsRequest,
    TwirpError,
    UpdateRoomMetadataRequest,
)
from redis.exceptions import RedisError

from core import utils

logger = getLogger(__name__)

# The LiveKit client's own timeout never applies, so each call carries this one.
MEDIA_SERVER_TIMEOUT_SECONDS = 5
# Long enough for the read and the write of one metadata update.
METADATA_LOCK_TIMEOUT_SECONDS = 3 * MEDIA_SERVER_TIMEOUT_SECONDS
METADATA_UPDATE_FAILED = "Could not update room metadata"


async def bounded(call):
    """Await one media server call under its own deadline."""
    async with asyncio.timeout(MEDIA_SERVER_TIMEOUT_SECONDS):
        return await call


class RoomManagementException(Exception):
    """Exception raised when a room management operation fails."""


class RoomNotFoundException(RoomManagementException):
    """Raised when the target room does not exist in LiveKit."""


class MetadataWriteTimeout(RoomManagementException):
    """Raised when a metadata write outlives its deadline and may still land."""


class RoomManagement:
    """Service for managing LiveKit rooms."""

    @classmethod
    def update_metadata(
        cls,
        room_name: str,
        metadata: Optional[Dict] = None,
        remove_keys: Optional[list[str]] = None,
    ):
        """Merge values into a LiveKit room's metadata.

        The `room_name` corresponds to the LiveKit room identifier
        (i.e. the Room model's UUID as a string). Writers of the same room
        take turns, so no write drops a key another one set.

        Raises:
            RoomNotFoundException: the room does not exist in LiveKit.
            RoomManagementException: the metadata update otherwise fails.
        """

        # A writer waits a deadline longer than another may hold the lock, so
        # none gives up just before it expires.
        lock = cache.lock(
            f"room-metadata:{room_name}",
            timeout=METADATA_LOCK_TIMEOUT_SECONDS,
            blocking_timeout=METADATA_LOCK_TIMEOUT_SECONDS
            + MEDIA_SERVER_TIMEOUT_SECONDS,
        )
        try:
            acquired = lock.acquire()
        except RedisError as e:
            raise RoomManagementException("Could not lock room metadata") from e
        if not acquired:
            raise RoomManagementException("Could not lock room metadata")

        release = True
        try:
            cls._update_metadata(room_name, metadata, remove_keys)
        except MetadataWriteTimeout:
            # The write may still land, so the lock is left to expire and the
            # next writer reads after it.
            release = False
            raise
        finally:
            # A lock this fails to release, redis down included, expires by itself.
            if release:
                with contextlib.suppress(RedisError):
                    lock.release()

    @staticmethod
    @async_to_sync
    async def _update_metadata(room_name, metadata, remove_keys):
        """Read, merge and write a room's metadata; the caller holds the room's lock."""

        lkapi = utils.create_livekit_client()

        try:
            response = await bounded(
                lkapi.room.list_rooms(ListRoomsRequest(names=[room_name]))
            )

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

            try:
                await bounded(
                    lkapi.room.update_room_metadata(
                        UpdateRoomMetadataRequest(
                            room=room_name,
                            metadata=json.dumps(updated_metadata),
                        )
                    )
                )
            except TimeoutError as e:
                logger.warning("Timed out writing metadata for room %s", room_name)
                raise MetadataWriteTimeout(METADATA_UPDATE_FAILED) from e

        except TwirpError as e:
            if e.code == "not_found":
                raise RoomNotFoundException("Room does not exist") from e

            logger.exception(
                "Unexpected error updating metadata for room %s",
                room_name,
            )
            raise RoomManagementException(METADATA_UPDATE_FAILED) from e

        except TimeoutError as e:
            logger.warning("Timed out updating metadata for room %s", room_name)
            raise RoomManagementException(METADATA_UPDATE_FAILED) from e

        finally:
            await lkapi.aclose()

    @staticmethod
    @async_to_sync
    async def has_active_egress(room_name: str):
        """True while a recorder of the media server runs in the room.

        A recorder asked to stop is ending: it captures nothing more, so it is not counted.

        Raises:
            RoomManagementException: the media server could not answer.
        """

        lkapi = utils.create_livekit_client()

        try:
            response = await bounded(
                lkapi.egress.list_egress(
                    ListEgressRequest(room_name=room_name, active=True)
                )
            )
        except (TwirpError, TimeoutError, aiohttp.ClientError) as e:
            logger.warning("Could not list the recorders of room %s", room_name)
            raise RoomManagementException("Could not list room recorders") from e
        finally:
            await lkapi.aclose()

        return any(
            item.status in (EgressStatus.EGRESS_STARTING, EgressStatus.EGRESS_ACTIVE)
            for item in response.items
        )

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
