"""Room management service for LiveKit rooms."""

# pylint: disable=no-name-in-module

import contextlib
import json
from logging import getLogger
from typing import Dict, Optional

from django.conf import settings

import aiohttp
from asgiref.sync import async_to_sync
from livekit.api import (
    CreateRoomRequest,
    DeleteRoomRequest,
    ListRoomsRequest,
    TwirpError,
    TwirpErrorCode,
    UpdateRoomMetadataRequest,
)
from livekit.protocol.models import Room as LiveKitRoom

from core import utils
from core.livekit.clusters import LiveKitClusterConfig
from core.livekit.exceptions import (
    LiveKitClusterUnavailableError,
    LiveKitRoomCreationError,
)
from core.livekit.placements import PlacementService
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
    async def create_room(
        cls, room_name: str, *, cluster: LiveKitClusterConfig
    ) -> LiveKitRoom:
        """Create a LiveKit room on a LiveKit cluster and return it.

        It is returned as the cluster describes it, with its SID and the time
        the cluster created it. A LiveKit room live on the cluster already is
        returned as it is.
        """

        lkapi = utils.create_livekit_client(cluster=cluster)

        try:
            livekit_room = await lkapi.room.create_room(
                CreateRoomRequest(name=room_name)
            )
        except (TwirpError, TimeoutError, aiohttp.ClientError) as e:
            if isinstance(e, LiveKitClusterUnavailableError):
                logger.warning(
                    "LiveKit cluster %s failed to create LiveKit room %s: its "
                    "circuit breaker refused the call",
                    cluster.name,
                    room_name,
                )
            else:
                logger.exception(
                    "LiveKit cluster %s failed to create LiveKit room %s",
                    cluster.name,
                    room_name,
                )
            raise LiveKitRoomCreationError(
                f"LiveKit cluster {cluster.name} failed to create LiveKit room "
                f"{room_name}."
            ) from e
        finally:
            await lkapi.aclose()

        return livekit_room

    @classmethod
    async def list_rooms(cls, cluster: LiveKitClusterConfig) -> list[LiveKitRoom]:
        """List the LiveKit rooms live on a LiveKit cluster.

        This is a coroutine, for callers to list several clusters at once. The
        errors of a cluster that cannot be listed, TwirpError, TimeoutError and
        aiohttp.ClientError, are raised as they are, for the caller to tell it
        apart.
        """

        lkapi = utils.create_livekit_client(cluster=cluster)

        try:
            response = await lkapi.room.list_rooms(ListRoomsRequest())
        finally:
            await lkapi.aclose()

        return list(response.rooms)

    @classmethod
    def update_metadata(
        cls,
        room_name: str,
        metadata: Optional[Dict] = None,
        remove_keys: Optional[list[str]] = None,
        *,
        cluster: Optional[LiveKitClusterConfig] = None,
    ):
        """Merge values into a LiveKit room's metadata.

        The `room_name` corresponds to the LiveKit room identifier
        (i.e. the Room model's UUID as a string). The LiveKit room is
        updated on `cluster`, by default the LiveKit cluster it is placed on.

        Raises:
            RoomNotFoundException: the room does not exist in LiveKit.
            RoomManagementException: the metadata update otherwise fails.
        """

        cluster = cluster or PlacementService.cluster_for(room_name)
        cls._update_metadata(room_name, metadata, remove_keys, cluster=cluster)

    @classmethod
    @async_to_sync
    async def _update_metadata(
        cls,
        room_name: str,
        metadata: Optional[Dict],
        remove_keys: Optional[list[str]],
        *,
        cluster: LiveKitClusterConfig,
    ):
        """Merge values into a LiveKit room's metadata on a LiveKit cluster."""

        lkapi = utils.create_livekit_client(cluster=cluster)

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

        except (TwirpError, TimeoutError, aiohttp.ClientError) as e:
            if isinstance(e, TwirpError) and e.code == TwirpErrorCode.NOT_FOUND:
                raise RoomNotFoundException("Room does not exist") from e

            if isinstance(e, LiveKitClusterUnavailableError):
                logger.warning(
                    "Could not update metadata for room %s: %s", room_name, e
                )
            else:
                logger.exception(
                    "Unexpected error updating metadata for room %s",
                    room_name,
                )
            raise RoomManagementException("Could not update room metadata") from e

        finally:
            await lkapi.aclose()

    @classmethod
    def delete_room(
        cls, room_name: str, *, cluster: Optional[LiveKitClusterConfig] = None
    ):
        """Delete a LiveKit room and disconnect all participants.

        The LiveKit room is deleted on `cluster`, by default the LiveKit
        cluster it is placed on.

        Raises:
            RoomNotFoundException: the room does not exist in LiveKit.
            RoomManagementException: the deletion otherwise fails.
        """

        cluster = cluster or PlacementService.cluster_for(room_name)
        cls._delete_room(room_name, cluster=cluster)

    @classmethod
    @async_to_sync
    async def _delete_room(cls, room_name: str, *, cluster: LiveKitClusterConfig):
        """Delete a LiveKit room on a LiveKit cluster."""

        lkapi = utils.create_livekit_client(cluster=cluster)

        try:
            await lkapi.room.delete_room(DeleteRoomRequest(room=room_name))
            logger.info("Deleted LiveKit room %s", room_name)
        except (TwirpError, TimeoutError, aiohttp.ClientError) as e:
            if isinstance(e, TwirpError) and e.code == TwirpErrorCode.NOT_FOUND:
                logger.warning(
                    "Room %s not found in LiveKit, skipping deletion",
                    room_name,
                )
                raise RoomNotFoundException("Room does not exist") from e

            if isinstance(e, LiveKitClusterUnavailableError):
                logger.warning("Could not delete room %s: %s", room_name, e)
            else:
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
