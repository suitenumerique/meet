"""Room management service for LiveKit rooms."""

# pylint: disable=no-name-in-module

import contextlib
import json
from logging import getLogger
from typing import Dict, Optional

from django.conf import settings

from asgiref.sync import async_to_sync
from livekit.api import (
    DeleteRoomRequest,
    ListRoomsRequest,
    TwirpError,
    UpdateRoomMetadataRequest,
)

from core import utils
from core.models import Room

from .sip_management import SIPException, SIPManagement

logger = getLogger(__name__)


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
    def soft_delete(cls, room: Room):
        """Soft delete a room, then close its LiveKit room and its SIP routing.

        Raises:
            RoomManagementException: the LiveKit room could not be closed, or its
                SIP dispatch rule could not be deleted.
        """

        room.soft_delete()

        try:
            with contextlib.suppress(RoomNotFoundException):
                cls.delete_room(str(room.id))

            cls._delete_dispatch_rule(room)
        except Exception:
            Room.all_objects.filter(pk=room.pk, deleted_at=room.deleted_at).update(
                deleted_at=None
            )
            room.deleted_at = None
            raise

    @staticmethod
    def _delete_dispatch_rule(room: Room):
        """Delete a room's SIP dispatch rule, so its PIN no longer routes calls.

        This cannot be left to the room_finished webhook: a roomkit join creates
        the rule before any LiveKit room exists, so no room may ever finish.
        """

        if settings.ROOM_TELEPHONY_ENABLED or settings.ROOMKIT_ENABLED:
            try:
                SIPManagement().delete_dispatch_rule(room.id)
            except SIPException as e:
                raise RoomManagementException("Could not delete dispatch rule") from e

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
