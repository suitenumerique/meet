"""LiveKit Events Service"""

# pylint: disable=no-member

import re
import uuid
from enum import Enum
from logging import getLogger

from django.conf import settings
from django.utils import timezone

from livekit import api

from core import models
from core.recording.enums import RecordingWorkerEvent
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


def to_recording_event(egress_status):
    """Translate a LiveKit egress status into a recording worker event."""

    event = EGRESS_STATUS_TO_RECORDING_EVENT.get(egress_status)
    if event is None:
        logger.warning(
            "Unmapped LiveKit egress status '%s', ignoring the event.",
            egress_status,
        )
    return event


class LiveKitEventsService:
    """Service for processing and handling LiveKit webhook events and notifications."""

    def __init__(self):
        """Initialize with required services."""

        self._webhook_handlers = {
            "egress_updated": self._handle_egress_updated,
            "egress_ended": self._handle_egress_ended,
            "room_started": self._handle_room_started,
            "room_finished": self._handle_room_finished,
            "participant_left": self._handle_participant_left,
        }

        token_verifier = api.TokenVerifier(
            settings.LIVEKIT_CONFIGURATION["api_key"],
            settings.LIVEKIT_CONFIGURATION["api_secret"],
        )
        self.webhook_receiver = api.WebhookReceiver(token_verifier)
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

    def receive(self, request):
        """Process webhook and route to appropriate handler."""

        auth_token = request.headers.get("Authorization")
        if not auth_token:
            raise AuthenticationError("Authorization header missing")

        try:
            data = self.webhook_receiver.receive(
                request.body.decode("utf-8"), auth_token
            )
        except Exception as e:
            raise InvalidPayloadError("Invalid webhook payload") from e

        room_name = data.room.name or data.egress_info.room_name

        if self._is_connection_test_room(room_name):
            logger.info(
                "Ignoring webhook event for connection test room '%s'.",
                room_name,
            )
            return

        if self._filter_regex and not self._filter_regex.search(room_name):
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
        handler = self._webhook_handlers.get(webhook_type.value)

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

        event = to_recording_event(data.egress_info.status)

        # Log if/why the recording failed
        self.recording_events.log_worker_error(
            recording,
            event,
            error=data.egress_info.error,
            error_code=data.egress_info.error_code,
        )

        # Update room
        try:
            room_name = str(recording.room.id)
            RoomManagement.update_metadata(
                room_name, remove_keys=["recording_mode", "recording_status"]
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
    def _is_connection_test_room(room_name: str) -> bool:
        """Return True for ephemeral rooms created by the connection test endpoint."""
        return room_name.startswith(settings.CONNECTION_TEST_ROOM_PREFIX)

    def _handle_room_started(self, data):
        """Handle 'room_started' event."""

        try:
            room_id = uuid.UUID(data.room.name)
        except ValueError as e:
            logger.warning(
                "Ignoring room event: room name '%s' is not a valid UUID format.",
                data.room.name,
            )
            raise ActionFailedError("Failed to process room started event") from e

        room_updated_count = models.Room.objects.filter(pk=room_id).update(
            last_started_at=timezone.now()
        )
        if not room_updated_count:
            raise ActionFailedError(f"Room with ID {room_id} does not exist")

        if settings.ROOM_TELEPHONY_ENABLED or settings.ROOMKIT_ENABLED:
            try:
                room = models.Room.objects.get(pk=room_id)
            except models.Room.DoesNotExist as err:
                raise ActionFailedError(
                    f"Room with ID {room_id} does not exist"
                ) from err

            try:
                self.sip_management.ensure_dispatch_rule(room)
            except SIPException as e:
                raise ActionFailedError(
                    f"Failed to create sip dispatch rule for room {room_id}"
                ) from e

    def _handle_room_finished(self, data):
        """Handle 'room_finished' event."""

        try:
            room_id = uuid.UUID(data.room.name)
        except ValueError as e:
            logger.warning(
                "Ignoring room event: room name '%s' is not a valid UUID format.",
                data.room.name,
            )
            raise ActionFailedError("Failed to process room finished event") from e

        if settings.ROOM_TELEPHONY_ENABLED or settings.ROOMKIT_ENABLED:
            try:
                self.sip_management.delete_dispatch_rule(room_id)
            except SIPException as e:
                raise ActionFailedError(
                    f"Failed to delete sip dispatch rule for room {room_id}"
                ) from e

        self.presence_cache.clear_room(room_id)

        try:
            self.lobby_service.clear_room_cache(room_id)
        except Exception as e:
            raise ActionFailedError(
                f"Failed to clear room cache for room {room_id}"
            ) from e

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
