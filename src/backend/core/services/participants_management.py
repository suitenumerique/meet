"""Participants management service for LiveKit rooms."""

# pylint: disable=too-many-arguments,no-name-in-module,too-many-positional-arguments
# ruff: noqa:PLR0913

import json
import uuid
from logging import getLogger
from typing import Dict, Optional

from asgiref.sync import async_to_sync
from livekit.api import (
    MuteRoomTrackRequest,
    RoomParticipantIdentity,
    TwirpError,
    TwirpErrorCode,
    UpdateParticipantRequest,
)
from livekit.protocol.models import ParticipantInfo

from core import utils
from core.livekit.clusters import LiveKitClusterConfig
from core.livekit.placements import PlacementService

from .lobby import LobbyService
from .presence import PresenceCache

logger = getLogger(__name__)


class ParticipantsManagementException(Exception):
    """Exception raised when a participant management operations fail."""


class ParticipantNotFoundException(ParticipantsManagementException):
    """Raised when the target participant does not exist in the room."""


class ParticipantsManagement:
    """Service for managing participants."""

    def mute(
        self,
        room_name: str,
        identity: str,
        track_sid: str,
        *,
        cluster: Optional[LiveKitClusterConfig] = None,
    ):
        """Mute a specific audio or video track for a participant in a room."""

        cluster = cluster or PlacementService.cluster_for(room_name)
        self._mute(room_name, identity, track_sid, cluster=cluster)

    @async_to_sync
    async def _mute(
        self,
        room_name: str,
        identity: str,
        track_sid: str,
        *,
        cluster: LiveKitClusterConfig,
    ):
        """Mute a participant's track in a LiveKit room on a LiveKit cluster."""

        lkapi = utils.create_livekit_client(cluster=cluster)

        try:
            await lkapi.room.mute_published_track(
                MuteRoomTrackRequest(
                    room=room_name,
                    identity=identity,
                    track_sid=track_sid,
                    muted=True,
                )
            )

        except (TwirpError, TimeoutError) as e:
            if isinstance(e, TwirpError) and e.code == TwirpErrorCode.NOT_FOUND:
                logger.warning(
                    "Participant %s not found in room %s, skipping muting",
                    identity,
                    room_name,
                )
                raise ParticipantNotFoundException("Participant does not exist") from e

            logger.exception(
                "Unexpected error muting participant %s for room %s",
                identity,
                room_name,
            )
            raise ParticipantsManagementException("Could not mute participant") from e

        finally:
            await lkapi.aclose()

    def remove(
        self,
        room_name: str,
        identity: str,
        *,
        cluster: Optional[LiveKitClusterConfig] = None,
    ):
        """Remove a participant from a room and clear their lobby/presence cache."""

        cluster = cluster or PlacementService.cluster_for(room_name)
        self._remove(room_name, identity, cluster=cluster)

    @async_to_sync
    async def _remove(
        self, room_name: str, identity: str, *, cluster: LiveKitClusterConfig
    ):
        """Remove a participant from a LiveKit room on a LiveKit cluster."""

        PresenceCache().clear(room_name, identity)

        try:
            LobbyService().clear_participant_cache(
                room_id=uuid.UUID(room_name), participant_id=identity
            )
        except (ValueError, TypeError) as exc:
            logger.warning(
                "participants_management.remove: room_name '%s' is not a UUID; "
                "skipping lobby cache clear",
                room_name,
                exc_info=exc,
            )

        lkapi = utils.create_livekit_client(cluster=cluster)

        try:
            await lkapi.room.remove_participant(
                RoomParticipantIdentity(room=room_name, identity=identity)
            )
        except (TwirpError, TimeoutError) as e:
            if isinstance(e, TwirpError) and e.code == TwirpErrorCode.NOT_FOUND:
                logger.warning(
                    "Participant %s not found in room %s, skipping removing",
                    identity,
                    room_name,
                )
                raise ParticipantNotFoundException("Participant does not exist") from e

            logger.exception(
                "Unexpected error removing participant %s for room %s",
                identity,
                room_name,
            )
            raise ParticipantsManagementException("Could not remove participant") from e

        finally:
            await lkapi.aclose()

    def update(  # noqa: PLR0917
        self,
        room_name: str,
        identity: str,
        metadata: Optional[Dict] = None,
        attributes: Optional[Dict] = None,
        permission: Optional[Dict] = None,
        name: Optional[str] = None,
        *,
        cluster: Optional[LiveKitClusterConfig] = None,
    ):
        """Update participant properties such as metadata, attributes, permissions, or name."""

        cluster = cluster or PlacementService.cluster_for(room_name)
        self._update(
            room_name,
            identity,
            cluster=cluster,
            metadata=metadata,
            attributes=attributes,
            permission=permission,
            name=name,
        )

    @async_to_sync
    async def _update(
        self,
        room_name: str,
        identity: str,
        *,
        cluster: LiveKitClusterConfig,
        metadata: Optional[Dict],
        attributes: Optional[Dict],
        permission: Optional[Dict],
        name: Optional[str],
    ):
        """Update a participant of a LiveKit room on a LiveKit cluster."""

        lkapi = utils.create_livekit_client(cluster=cluster)

        try:
            await lkapi.room.update_participant(
                UpdateParticipantRequest(
                    room=room_name,
                    identity=identity,
                    metadata=json.dumps(metadata),
                    permission=permission,
                    attributes=attributes,
                    name=name,
                )
            )

        except (TwirpError, TimeoutError) as e:
            if isinstance(e, TwirpError) and e.code == TwirpErrorCode.NOT_FOUND:
                logger.warning(
                    "Participant %s not found in room %s, skipping update",
                    identity,
                    room_name,
                )
                raise ParticipantNotFoundException("Participant does not exist") from e

            logger.exception(
                "Unexpected error updating participant %s for room %s",
                identity,
                room_name,
            )
            raise ParticipantsManagementException("Could not update participant") from e

        finally:
            await lkapi.aclose()

    def check_if_in_meeting_cached(self, room_name: str, identity: str) -> bool:
        """Cache-first variant of `check_if_in_meeting`.

        Cache hit  -> True without touching LiveKit.
        Cache miss -> ask LiveKit; memoize only positive answers.

        Raises the same exceptions as `check_if_in_meeting` so callers keep
        failing closed the same way.
        """
        if not room_name or not identity:
            return False

        presence_cache = PresenceCache()

        if presence_cache.is_marked_present(room_name, identity):
            return True

        present = self.check_if_in_meeting(room_name=room_name, identity=identity)

        if present:
            presence_cache.mark_present(room_name, identity)

        return present

    def check_if_in_meeting(
        self,
        room_name: str,
        identity: str,
        *,
        cluster: Optional[LiveKitClusterConfig] = None,
    ) -> bool:
        """Check whether `identity` is currently a participant in `room_name`.

        Raises ParticipantsManagementException for unexpected LiveKit errors
        so callers can fail closed rather than silently allowing the action.
        """

        if not room_name or not identity:
            return False

        cluster = cluster or PlacementService.cluster_for(room_name)
        return self._check_if_in_meeting(room_name, identity, cluster=cluster)

    @async_to_sync
    async def _check_if_in_meeting(
        self, room_name: str, identity: str, *, cluster: LiveKitClusterConfig
    ) -> bool:
        """Check whether `identity` is a participant of a LiveKit room on a cluster."""

        lkapi = utils.create_livekit_client(cluster=cluster)

        try:
            participant = await lkapi.room.get_participant(
                RoomParticipantIdentity(
                    room=room_name,
                    identity=identity,
                )
            )
        except (TwirpError, TimeoutError) as e:
            if isinstance(e, TwirpError) and e.code == TwirpErrorCode.NOT_FOUND:
                raise ParticipantNotFoundException("Participant does not exist") from e

            logger.exception(
                "Unexpected error checking participant %s in room %s",
                identity,
                room_name,
            )
            raise ParticipantsManagementException(
                "Could not verify participant presence"
            ) from e

        finally:
            await lkapi.aclose()

        return (
            participant is not None
            and participant.state != ParticipantInfo.State.DISCONNECTED
        )
