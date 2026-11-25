"""Room management service for LiveKit rooms."""

# pylint: disable=no-name-in-module

import contextlib
import json
from logging import getLogger
from typing import Dict, Optional

from django.conf import settings

from asgiref.sync import async_to_sync
from livekit.api import (
    CreateRoomRequest,
    DeleteRoomRequest,
    ListRoomsRequest,
    TwirpError,
    TwirpErrorCode,
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

    @staticmethod
    def _metadata_for_room(room: Room) -> Dict:
        """Build the LiveKit metadata describing a room."""
        return {
            "configuration": room.configuration,
            "access_level": room.access_level,
        }

    @classmethod
    @async_to_sync
    async def create_room(cls, room_name: str, metadata: Optional[Dict] = None):
        """Ensure a LiveKit room exists, creating it if it does not.

        This is what lets the server keep `room.auto_create: false`, since a
        room then has to be created before a participant is given a token for it.

        The room is only created when missing: LiveKit's CreateRoom updates the
        metadata of an existing room, which would wipe the recording state the
        room carries while a recording is in progress.

        The `room_name` corresponds to the LiveKit room identifier
        (i.e. the Room model's UUID as a string, or an unregistered room's slug).

        Raises:
            RoomManagementException: the room could not be created.
        """

        lkapi = utils.create_livekit_client()

        try:
            response = await lkapi.room.list_rooms(ListRoomsRequest(names=[room_name]))

            if response.rooms:
                return

            await lkapi.room.create_room(
                CreateRoomRequest(
                    name=room_name,
                    metadata=json.dumps(metadata) if metadata is not None else "",
                )
            )

        except (TwirpError, TimeoutError) as e:
            # A concurrent join may have created the room between the check and
            # the call; that is the outcome we want anyway.
            if isinstance(e, TwirpError) and e.code == TwirpErrorCode.ALREADY_EXISTS:
                logger.debug("LiveKit room %s already exists", room_name)
                return

            logger.exception("Unexpected error ensuring room %s exists", room_name)
            raise RoomManagementException("Could not create room") from e

        finally:
            await lkapi.aclose()

    @classmethod
    def ensure_room(cls, room: Room):
        """Create a room's LiveKit room, carrying its current settings.

        Raises:
            RoomManagementException: the room could not be created.
        """
        cls.create_room(str(room.id), metadata=cls._metadata_for_room(room))

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

        except (TwirpError, TimeoutError) as e:
            if isinstance(e, TwirpError) and e.code == TwirpErrorCode.NOT_FOUND:
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
        except (TwirpError, TimeoutError) as e:
            if isinstance(e, TwirpError) and e.code == TwirpErrorCode.NOT_FOUND:
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
        """Soft delete a room, remove its SIP routing and close its LiveKit room."""

        room.soft_delete()
        rule_deleted = False

        try:
            rule_deleted = cls._delete_dispatch_rule(room)

            with contextlib.suppress(RoomNotFoundException):
                cls.delete_room(str(room.id))
        except Exception:
            Room.all_objects.filter(pk=room.pk, deleted_at=room.deleted_at).update(
                deleted_at=None
            )
            room.deleted_at = None
            if rule_deleted:
                cls._restore_dispatch_rule(room)
            raise

    @staticmethod
    def _delete_dispatch_rule(room: Room):
        """Delete a room's SIP dispatch rule, so its PIN no longer routes calls.

        This cannot be left to the room_finished webhook: a roomkit join creates
        the rule before any LiveKit room exists, so no room may ever finish.

        Returns whether a rule was deleted
        """

        if not (settings.ROOM_TELEPHONY_ENABLED or settings.ROOMKIT_ENABLED):
            return False

        try:
            return SIPManagement().delete_dispatch_rule(room.id)
        except SIPException as e:
            raise RoomManagementException("Could not delete dispatch rule") from e

    @staticmethod
    def _restore_dispatch_rule(room: Room):
        """Recreate a room's SIP dispatch rule after a failed soft delete."""

        try:
            SIPManagement().ensure_dispatch_rule(room)
        except Exception:  # pylint: disable=broad-exception-caught
            logger.exception("Could not restore dispatch rule for room %s", room.id)

    @classmethod
    def sync_room_metadata(cls, room):
        """Push a room's configuration and access level to its LiveKit room metadata.

        Failures are swallowed: a room that is not live yet, or a LiveKit hiccup,
        should never fail the request that triggered the update.
        """

        try:
            cls.update_metadata(
                room_name=str(room.id),
                metadata=cls._metadata_for_room(room),
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
