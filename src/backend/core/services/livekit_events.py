"""LiveKit Events Service"""

# pylint: disable=no-member

import re
import uuid
from collections.abc import Iterable
from enum import Enum
from logging import getLogger

from django.conf import settings
from django.utils import timezone

from livekit import api

from core import audit, auditing, models
from core.livekit.clusters import (
    LiveKitClusterConfig,
    LiveKitClusterTokenVerifier,
    get_default_livekit_cluster,
)
from core.livekit.exceptions import LiveKitRoomCloseError, PlacementChangedError
from core.livekit.placements import PlacementService
from core.recording.enums import UNSUCCESSFUL_EVENTS, RecordingWorkerEvent
from core.recording.event.authentication import MachineUser
from core.recording.services.metadata_collector import (
    MetadataCollectorException,
    MetadataCollectorService,
)
from core.recording.services.recording_events import RecordingEventsService

from .lobby import LobbyService
from .presence import PresenceCache
from .room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)
from .sip_management import SIPException, SIPManagement

logger = getLogger(__name__)

SERVICE_ORIGIN = "livekit"


class LiveKitWebhookError(Exception):
    """Base exception for LiveKit webhook processing errors."""

    status_code = 500


class AuthenticationError(LiveKitWebhookError):
    """Authentication failed."""

    status_code = 401


class InvalidPayloadError(LiveKitWebhookError):
    """Invalid webhook payload."""

    status_code = 400


class ActionFailedError(LiveKitWebhookError):
    """Webhook action fails to process or complete."""

    status_code = 500


class LiveKitWebhookEventType(Enum):
    """LiveKit webhook event types."""

    # Room events
    ROOM_STARTED = "room_started"
    ROOM_FINISHED = "room_finished"

    # Participant events
    PARTICIPANT_JOINED = "participant_joined"
    PARTICIPANT_LEFT = "participant_left"
    PARTICIPANT_CONNECTION_ABORTED = "participant_connection_aborted"

    # Track events
    TRACK_PUBLISHED = "track_published"
    TRACK_UNPUBLISHED = "track_unpublished"

    # Egress events
    EGRESS_STARTED = "egress_started"
    EGRESS_UPDATED = "egress_updated"
    EGRESS_ENDED = "egress_ended"

    # Ingress events
    INGRESS_STARTED = "ingress_started"
    INGRESS_ENDED = "ingress_ended"


# LiveKit egress statuses mapped to recording worker event statuses
EGRESS_STATUS_TO_RECORDING_EVENT = {
    api.EgressStatus.EGRESS_STARTING: RecordingWorkerEvent.STARTING,
    api.EgressStatus.EGRESS_ACTIVE: RecordingWorkerEvent.STARTED,
    api.EgressStatus.EGRESS_ENDING: RecordingWorkerEvent.SAVING,
    api.EgressStatus.EGRESS_COMPLETE: RecordingWorkerEvent.COMPLETED,
    api.EgressStatus.EGRESS_LIMIT_REACHED: RecordingWorkerEvent.LIMIT_REACHED,
    api.EgressStatus.EGRESS_ABORTED: RecordingWorkerEvent.ABORTED,
    api.EgressStatus.EGRESS_FAILED: RecordingWorkerEvent.FAILED,
}

EGRESS_ROOM_CONNECTION_FAILED_ERROR = "recording ended early: connection to room failed"
EGRESS_CPU_EXHAUSTED_DETAILS = "End reason: CPU exhausted"


def to_recording_event(egress_status):
    """Translate a LiveKit egress status into a recording worker event."""

    event = EGRESS_STATUS_TO_RECORDING_EVENT.get(egress_status)
    if event is None:
        logger.warning(
            "Unmapped LiveKit egress status '%s', ignoring the event.",
            egress_status,
        )
    return event


def to_ended_recording_event(egress_info):
    """Translate an ended LiveKit egress into a recording worker event.

    This handles partial media file upload where an egress was interrupted
    which can happen when:
    - an transcription egress that lost its room connection uploads an audio file, then ends
      FAILED with the EGRESS_ROOM_CONNECTION_FAILED_ERROR
    - an egress drained because its host ran out of CPU which can transition to COMPLETE state
      with EGRESS_CPU_EXHAUSTED_DETAILS or FAILED state if the drain outlasted its grace period
      and the egress got killed, possibly before the upload.
    """

    status = egress_info.status
    is_cut_short = (
        egress_info.error == EGRESS_ROOM_CONNECTION_FAILED_ERROR
        or egress_info.details == EGRESS_CPU_EXHAUSTED_DETAILS
    )
    has_uploaded_file = any(file.location for file in egress_info.file_results)

    if is_cut_short and (
        status == api.EgressStatus.EGRESS_COMPLETE
        or (status == api.EgressStatus.EGRESS_FAILED and has_uploaded_file)
    ):
        return RecordingWorkerEvent.INTERRUPTED

    return to_recording_event(status)


class LiveKitEventsService:
    """Service for processing and handling LiveKit webhook events and notifications."""

    def __init__(self):
        """Initialize with required services."""

        self._webhook_handlers = {
            LiveKitWebhookEventType.EGRESS_UPDATED: self._handle_egress_updated,
            LiveKitWebhookEventType.EGRESS_ENDED: self._handle_egress_ended,
            LiveKitWebhookEventType.ROOM_STARTED: self._handle_room_started,
            LiveKitWebhookEventType.ROOM_FINISHED: self._handle_room_finished,
            LiveKitWebhookEventType.PARTICIPANT_LEFT: self._handle_participant_left,
        }

        self.token_verifier = LiveKitClusterTokenVerifier()
        self.lobby_service = LobbyService()
        self.presence_cache = PresenceCache()
        self.sip_management = SIPManagement()
        self.recording_events = RecordingEventsService()

        self._filter_regex = None
        if settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX:
            try:
                self._filter_regex = re.compile(
                    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX
                )
            except re.error:
                logger.exception(
                    "Invalid LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX. Webhook filtering disabled."
                )

    @property
    def cluster(self) -> LiveKitClusterConfig:
        """Return the LiveKit cluster that signed the webhook received.

        It is the default cluster until a webhook is received, as when a
        handler is called directly.
        """
        return self.token_verifier.cluster or get_default_livekit_cluster()

    def receive(self, request):
        """Process webhook and route to appropriate handler."""

        auth_token = request.headers.get("Authorization")
        if not auth_token:
            raise AuthenticationError("Authorization header missing")

        try:
            data = api.WebhookReceiver(self.token_verifier).receive(
                request.body.decode("utf-8"), auth_token
            )
        except Exception as e:
            raise InvalidPayloadError("Invalid webhook payload") from e

        room_name = data.room.name or data.egress_info.room_name

        if self.is_connection_test_room(room_name):
            logger.info(
                "Ignoring webhook event for connection test room '%s'.",
                room_name,
            )
            return

        if self.is_filtered_out(room_name):
            logger.info("Filtered webhook event for room '%s'", room_name)
            return

        try:
            webhook_type = LiveKitWebhookEventType(data.event)
        except ValueError:
            logger.warning(
                "Ignoring unknown LiveKit webhook event type '%s' for room '%s'",
                data.event,
                room_name,
            )
            return

        # Handle according to received webhook type
        handler = self._webhook_handlers.get(webhook_type)

        if handler is not None:
            handler(data)

    def _handle_egress_updated(self, data):
        """Handle 'egress_updated' event."""

        egress_id = data.egress_info.egress_id
        try:
            recording = models.Recording.objects.get(worker_id=egress_id)
        except models.Recording.DoesNotExist as err:
            raise ActionFailedError(
                f"Recording with worker ID {egress_id} does not exist"
            ) from err

        event = to_recording_event(data.egress_info.status)
        if event is None:
            return

        self.recording_events.handle_update(recording, event)

    def _handle_egress_ended(self, data):
        """Handle 'egress_ended' event.

        Egress ended is sent with one of these statuses:
        EGRESS_COMPLETE, EGRESS_FAILED, EGRESS_ABORTED, EGRESS_LIMIT_REACHED
        """

        # Fetch recording
        try:
            recording = models.Recording.objects.select_related("room").get(
                worker_id=data.egress_info.egress_id
            )
        except models.Recording.DoesNotExist as err:
            raise ActionFailedError(
                f"Recording with worker ID {data.egress_info.egress_id} does not exist"
            ) from err

        event = to_ended_recording_event(data.egress_info)
        self._audit_recording_end(recording, event, data.egress_info.error_code)

        # Log if/why the recording failed
        self.recording_events.log_worker_error(
            recording,
            event,
            error=data.egress_info.error,
            error_code=data.egress_info.error_code,
            details=data.egress_info.details,
        )

        # Update room
        try:
            room_name = str(recording.room.id)
            RoomManagement.update_metadata(
                room_name,
                remove_keys=["recording_mode", "recording_status"],
                cluster=recording.get_livekit_cluster(),
            )
        except RoomNotFoundException:
            logger.info(
                "LiveKit room %s no longer exists, skipping metadata update",
                room_name,
            )
        except RoomManagementException as e:
            logger.exception("Failed to update room's metadata: %s", e)

        # Stop metadata collector
        if recording.options.get("metadata_collector_dispatch_id", None) is not None:
            try:
                MetadataCollectorService().stop(recording)
            except MetadataCollectorException:
                logger.warning("Failed to stop the MetadataCollectorService")

        if event is None:
            return

        self.recording_events.handle_terminal_event(recording, event)

    @staticmethod
    def _audit_recording_end(recording, event, error_code=None):
        """Audit the end of a recording, as LiveKit reports it.

        An egress status the backend does not map has an unknown outcome.
        """
        if event is None:
            outcome = audit.Outcome.UNKNOWN
        elif event in UNSUCCESSFUL_EVENTS:
            outcome = audit.Outcome.FAILURE
        else:
            outcome = audit.Outcome.SUCCESS
        audit.log(
            auditing.RECORDING_END,
            actor=MachineUser(SERVICE_ORIGIN),
            auth_method="shared_secret",
            target=recording,
            outcome=outcome,
            worker_event=event.value if event is not None else None,
            error_code=error_code or None,
        )

    @staticmethod
    def is_connection_test_room(room_name: str) -> bool:
        """Return True for ephemeral rooms created by the connection test endpoint."""
        return room_name.startswith(settings.CONNECTION_TEST_ROOM_PREFIX)

    def is_filtered_out(self, room_name: str) -> bool:
        """Return whether LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX leaves a LiveKit
        room out, which it never does while unset or invalid."""
        return self._filter_regex is not None and not self._filter_regex.search(
            room_name
        )

    @staticmethod
    def room_id(room_name: str) -> uuid.UUID | None:
        """Return the id of the room a LiveKit room is named after, if any."""
        try:
            return uuid.UUID(room_name)
        except ValueError:
            return None

    @classmethod
    def _room_id(cls, room_name: str) -> uuid.UUID | None:
        """Return the id of the room a LiveKit room is named after."""
        room_id = cls.room_id(room_name)
        if room_id is None:
            logger.info(
                "Ignoring room event: room name '%s' is not a valid UUID format.",
                room_name,
            )
        return room_id

    def get_followed_rooms(
        self, room_names: Iterable[str]
    ) -> dict[str, models.Room | None]:
        """Return the rooms LiveKit rooms are named after, by LiveKit room name.

        Names are filtered as room webhooks are, so those that are not a UUID
        are left out. The others are mapped to their room, soft deleted ones
        included, or to None when no room has that id.
        """
        room_ids = {}
        for room_name in room_names:
            if self.is_connection_test_room(room_name) or self.is_filtered_out(
                room_name
            ):
                continue
            room_id = self.room_id(room_name)
            if room_id is not None:
                room_ids[room_name] = room_id

        rooms = models.Room.all_objects.in_bulk(set(room_ids.values()))
        return {name: rooms.get(room_id) for name, room_id in room_ids.items()}

    def _handle_room_started(self, data):
        """Handle 'room_started' event.

        It is ignored for a LiveKit room not named after a room Django knows,
        such as an unregistered room. A LiveKit room started for a deleted room
        is closed. Otherwise the LiveKit room is recorded on its placement, and
        the start of its room recorded only when it is the LiveKit room its room
        is placed on: other LiveKit rooms are closed or left alone.
        """

        room_id = self._room_id(data.room.name)
        if room_id is None:
            return

        try:
            room = models.Room.all_objects.get(id=room_id)
        except models.Room.DoesNotExist:
            logger.info("Ignoring room event: room %s does not exist.", room_id)
            return

        # The block below is intended to fix the issue where long-lived livekit
        # tokens allow users who already entered a room to re-create it,
        # even if it was closed.
        if room.is_deleted:
            self.close_deleted_room(room_id, cluster=self.cluster)
            return

        try:
            started = PlacementService.record_started(self.cluster, data.room, room)
        except (LiveKitRoomCloseError, PlacementChangedError) as e:
            raise ActionFailedError(
                f"Failed to record LiveKit room {room_id} started on LiveKit "
                f"cluster {self.cluster.name}"
            ) from e
        if not started:
            return

        self.record_room_start(room)

    def record_room_start(self, room: models.Room) -> None:
        """Record the start of a room whose LiveKit room started where it is
        placed.

        Raises:
            ActionFailedError: the SIP dispatch rule could not be ensured.
        """

        # Update through the queryset to skip the full_clean run by save()
        models.Room.all_objects.filter(pk=room.pk).update(
            last_started_at=timezone.now()
        )

        if settings.ROOM_TELEPHONY_ENABLED or settings.ROOMKIT_ENABLED:
            try:
                self.sip_management.ensure_dispatch_rule(room)
            except SIPException as e:
                raise ActionFailedError(
                    f"Failed to create sip dispatch rule for room {room.id}"
                ) from e

    @staticmethod
    def close_deleted_room(
        room_id: uuid.UUID, *, cluster: LiveKitClusterConfig
    ) -> None:
        """Close the LiveKit room of a soft deleted room on a LiveKit cluster.

        A join handing out credentials while the room was deleted may create
        it again, and so may participants holding credentials still valid on a
        cluster that creates LiveKit rooms when they join.

        Raises:
            ActionFailedError: the cluster failed to close the LiveKit room.
        """

        logger.warning(
            "LiveKit room %s started for a deleted room, closing it", room_id
        )

        try:
            RoomManagement.delete_room(str(room_id), cluster=cluster)
        except RoomNotFoundException:
            logger.info("LiveKit room %s is already closed", room_id)
        except RoomManagementException as e:
            raise ActionFailedError(f"Failed to close deleted room {room_id}") from e

    def _handle_room_finished(self, data):
        """Handle 'room_finished' event.

        The room is cleaned up only when the placement of its LiveKit room
        ended, or when it has none. The event is ignored for a LiveKit room not
        named after a room, such as an unregistered room.
        """

        room_id = self._room_id(data.room.name)
        if room_id is None:
            return

        if not self._end_placement(data.room):
            return

        self.clean_up_room(room_id)

    def clean_up_room(self, room_id: uuid.UUID) -> None:
        """Clean up a room whose meeting ended.

        Its presence and lobby caches are cleared even when its SIP dispatch
        rule could not be deleted: lobby admissions would otherwise outlive the
        meeting.

        Raises:
            ActionFailedError: the SIP dispatch rule could not be deleted, or
                the lobby cache cleared.
        """

        try:
            if settings.ROOM_TELEPHONY_ENABLED or settings.ROOMKIT_ENABLED:
                try:
                    self.sip_management.delete_dispatch_rule(room_id)
                except SIPException as e:
                    raise ActionFailedError(
                        f"Failed to delete sip dispatch rule for room {room_id}"
                    ) from e
        finally:
            self.presence_cache.clear_room(room_id)

            try:
                self.lobby_service.clear_room_cache(room_id)
            except Exception as e:
                raise ActionFailedError(
                    f"Failed to clear room cache for room {room_id}"
                ) from e

    def _end_placement(self, livekit_room) -> bool:
        """Delete the placement of a LiveKit room that finished.

        The placement is deleted only when it is on the cluster that sent the
        webhook, with the SID of the finished LiveKit room.

        - When nothing is deleted, the placement is read again to tell why.
        - Without placement, as for a LiveKit room live since before placements
          existed or a webhook delivered twice, the meeting is over and the room
          is cleaned up, or lobby admissions would outlive it.
        - With a placement on another cluster or with another SID, the room has
          moved on to another LiveKit room, relocated or created again since:
          cleaning up would erase the admissions of participants admitted from
          the lobby, who would be queued again, and delete the SIP dispatch rule
          the live LiveKit room uses.

        Return whether the room is to be cleaned up.
        """
        if not livekit_room.sid:
            return True

        cluster_name = self.cluster.name
        placements = models.Placement.objects.filter(room_name=livekit_room.name)
        deleted, _ = placements.filter(
            cluster=cluster_name, sid=livekit_room.sid
        ).delete()
        if deleted:
            return True

        placement = placements.first()
        if placement is None:
            return True

        logger.info(
            "LiveKit room %s finished on LiveKit cluster %s with SID %s, but is "
            "placed on LiveKit cluster %s with SID %r: ignoring the event",
            livekit_room.name,
            cluster_name,
            livekit_room.sid,
            placement.cluster,
            placement.sid,
        )
        return False

    def _handle_participant_left(self, data):
        """Handle 'participant_left': invalidate the presence cache.

        Presence entries are created lazily (only for users who administrate
        the lobby of a trusted room), so for most participants this delete is
        a no-op DEL on a key that never existed. Eager invalidation shrinks
        the window during which a departed participant could still act on a
        trusted room's lobby (cache hit until TTL expiry). It is gated behind
        `PRESENCE_CLEAR_ON_PARTICIPANT_LEFT` so its production impact can be
        measured and the behaviour reverted independently of the feature.
        When disabled, invalidation relies on `room_finished` and the TTL.
        """
        if not settings.PRESENCE_CLEAR_ON_PARTICIPANT_LEFT:
            return

        identity = data.participant.identity
        if not identity:
            return
        self.presence_cache.clear(data.room.name, identity)
