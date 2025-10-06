"""LiveKit Events Service"""

# pylint: disable=no-member

import logging
import re
import uuid
from enum import Enum
from logging import getLogger

from django.conf import settings

from livekit import api

from core import models
from core.recording.services.recording_events import (
    RecordingEventsError,
    RecordingEventsService,
)

from .lobby import LobbyService
from .telephony import TelephonyException, TelephonyService

logging.basicConfig(level=logging.DEBUG)

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


class UnsupportedEventTypeError(LiveKitWebhookError):
    """Unsupported event type."""

    status_code = 422


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


def _extract_recording_id_from_egress(data) -> str | None:
    """Try to extract recording_id from egress data filenames.
    On failure, return None.
    """
    ei = getattr(data, "egress_info", None)
    if not ei:
        return None

    fname = getattr(getattr(ei, "file", None), "filename", None)
    if not fname:
        try:
            outs = getattr(getattr(ei, "room_composite", None), "file_outputs", [])
            if outs:
                fname = getattr(outs[0], "filepath", None)
        except (AttributeError, IndexError, TypeError):
            fname = None

    if not fname:
        return None

    m = re.search(r"([0-9a-fA-F-]{36})\.ogg$", fname)
    return m.group(1) if m else None


class LiveKitEventsService:
    """Service for processing and handling LiveKit webhook events and notifications."""

    def __init__(self):
        """Initialize with required services."""

        token_verifier = api.TokenVerifier(
            settings.LIVEKIT_CONFIGURATION["api_key"],
            settings.LIVEKIT_CONFIGURATION["api_secret"],
        )
        self.webhook_receiver = api.WebhookReceiver(token_verifier)
        self.lobby_service = LobbyService()
        self.telephony_service = TelephonyService()
        self.recording_events = RecordingEventsService()

    def receive(self, request):
        """Process webhook and route to appropriate handler."""
        logger.debug("LiveKit webhook received")
        auth_token = request.headers.get("Authorization")
        if not auth_token:
            raise AuthenticationError("Authorization header missing")

        try:
            data = self.webhook_receiver.receive(
                request.body.decode("utf-8"), auth_token
            )
        except Exception as e:
            raise InvalidPayloadError("Invalid webhook payload") from e

        try:
            webhook_type = LiveKitWebhookEventType(data.event)
        except ValueError as e:
            raise UnsupportedEventTypeError(
                f"Unknown webhook type: {data.event}"
            ) from e

        handler_name = f"_handle_{webhook_type.value}"
        handler = getattr(self, handler_name, None)

        if not handler or not callable(handler):
            return
        logger.debug("Handling LiveKit webhook event: %s", data)
        # pylint: disable=not-callable
        handler(data)

    def _handle_egress_ended(self, data):
        """Handle 'egress_ended' event."""
        logger.debug(
            "Egress ended: id=%s status=%s",
            getattr(data.egress_info, "egress_id", None),
            getattr(data.egress_info, "status", None),
        )
        try:
            recording = models.Recording.objects.get(
                worker_id=data.egress_info.egress_id
            )
        except models.Recording.DoesNotExist as err:
            raise ActionFailedError(
                f"Recording with worker ID {data.egress_info.egress_id} does not exist"
            ) from err

        try:
            self.recording_events.handle_egress_ended(recording)
        except RecordingEventsError as e:
            raise ActionFailedError(
                f"Failed to process egress_ended for recording {recording.id}"
            ) from e

        if (
            data.egress_info.status == api.EgressStatus.EGRESS_LIMIT_REACHED
            and recording.status == models.RecordingStatusChoices.ACTIVE
        ):
            try:
                self.recording_events.handle_limit_reached(recording)
            except RecordingEventsError as e:
                raise ActionFailedError(
                    f"Failed to process limit reached event for recording {recording}"
                ) from e

    def _handle_egress_started(self, data):
        ei = getattr(data, "egress_info", None) or (
            data.get("egress_info") if isinstance(data, dict) else None
        )
        egress_id = None
        room_name = None
        status = None
        if ei:
            egress_id = getattr(ei, "egress_id", None) or getattr(ei, "egressId", None)
            room_name = getattr(ei, "room_name", None) or getattr(ei, "roomName", None)
            status = getattr(ei, "status", None)

        logger.warning(
            "egress_started: egress_id=%s status=%s room_name=%s",
            egress_id,
            status,
            room_name,
        )

        if not egress_id:
            logger.error("egress_started without egress_id")
            return

        rec = models.Recording.objects.filter(worker_id=egress_id).first()

        if rec is None:
            rec_id = _extract_recording_id_from_egress(data)
            if rec_id:
                rec = (
                    models.Recording.objects.filter(id=rec_id)
                    .select_related("room")
                    .first()
                )
                if rec and not rec.worker_id:
                    rec.worker_id = egress_id
                    rec.save(update_fields=["worker_id"])
                    logger.info(
                        "Attached worker_id=%s to recording=%s via filename",
                        egress_id,
                        rec.id,
                    )

        if rec is None and room_name:
            rec = (
                models.Recording.objects.filter(
                    room__livekit_name=room_name,
                    status__in=[
                        models.RecordingStatusChoices.INITIATED,
                        models.RecordingStatusChoices.ACTIVE,
                    ],
                )
                .order_by("-created_at")
                .select_related("room")
                .first()
            )
            if rec and not rec.worker_id:
                rec.worker_id = egress_id
                rec.save(update_fields=["worker_id"])
                logger.info(
                    "Heuristically attached worker_id=%s to recording=%s via livekit room",
                    egress_id,
                    rec.id,
                )

        if rec is None:
            logger.warning(
                "egress_started: unknown egress_id=%s (room_name=%s)",
                egress_id,
                room_name,
            )
            return

        lk_name = getattr(rec.room, "livekit_name", None)
        if room_name and lk_name and lk_name != room_name:
            logger.error(
                "Room mismatch: rec[%s].room=%s != event.room=%s",
                rec.id,
                lk_name,
                room_name,
            )
            return

        try:
            logger.debug(
                "Processing egress_started for recording %s (room=%s)",
                rec.id,
                lk_name or rec.room_id,
            )
            self.recording_events.handle_egress_started(rec)
        except RecordingEventsError as e:
            raise ActionFailedError(
                f"Failed to process egress_started for recording {rec.id}"
            ) from e

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

        try:
            room = models.Room.objects.get(id=room_id)
        except models.Room.DoesNotExist as err:
            raise ActionFailedError(f"Room with ID {room_id} does not exist") from err

        if settings.ROOM_TELEPHONY_ENABLED:
            try:
                self.telephony_service.create_dispatch_rule(room)
            except TelephonyException as e:
                raise ActionFailedError(
                    f"Failed to create telephony dispatch rule for room {room_id}"
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

        if settings.ROOM_TELEPHONY_ENABLED:
            try:
                self.telephony_service.delete_dispatch_rule(room_id)
            except TelephonyException as e:
                raise ActionFailedError(
                    f"Failed to delete telephony dispatch rule for room {room_id}"
                ) from e

        try:
            self.lobby_service.clear_room_cache(room_id)
        except Exception as e:
            raise ActionFailedError(
                f"Failed to clear room cache for room {room_id}"
            ) from e
