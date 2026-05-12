"""LiveKit Events Service"""

# pylint: disable=no-member

import re
import uuid
from enum import Enum
from logging import getLogger

from django.conf import settings

from livekit import api

from core import models, utils
from core.recording.services.recording_events import (
    RecordingEventsError,
    RecordingEventsService,
)

from .lobby import LobbyService
from .participants_management import (
    ParticipantsManagement,
    ParticipantsManagementException,
)
from .telephony import TelephonyException, TelephonyService

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

        if self._filter_regex and not self._filter_regex.search(room_name):
            logger.info("Filtered webhook event for room '%s'", room_name)
            return

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

        # pylint: disable=not-callable
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

        egress_status = data.egress_info.status
        self.recording_events.handle_update(recording, egress_status)

    def _handle_egress_ended(self, data):
        """Handle 'egress_ended' event."""

        try:
            recording = models.Recording.objects.get(
                worker_id=data.egress_info.egress_id
            )
        except models.Recording.DoesNotExist as err:
            raise ActionFailedError(
                f"Recording with worker ID {data.egress_info.egress_id} does not exist"
            ) from err

        try:
            room_name = str(recording.room.id)
            utils.update_room_metadata(
                room_name, {}, ["recording_mode", "recording_status"]
            )
        except utils.MetadataUpdateException as e:
            logger.exception("Failed to update room's metadata: %s", e)

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

    def _handle_participant_joined(self, data):
        """Handle 'participant_joined' event.

        When a SIP/phone participant joins an end-to-end encrypted room they
        cannot decrypt anything. We:
          1. Send an in-band notification so admins see a snackbar with an
             "Open settings" CTA.
          2. Leave the participant connected — the gateway is responsible for
             holding them on a placeholder prompt loop ("this meeting is
             encrypted, ask the host to disable it") until either the admin
             turns encryption off (we update LiveKit room metadata, gateway
             reacts) or the user hangs up.

        See README "Phone / SIP participants" for the full flow.
        """

        participant = getattr(data, "participant", None)
        if participant is None:
            return

        # LiveKit ParticipantInfo.Kind: 0 = STANDARD, 1 = INGRESS, 2 = EGRESS,
        # 3 = SIP, 4 = AGENT. We treat both SIP and INGRESS as "external
        # device that can't run our E2EE code".
        kind = getattr(participant, "kind", 0)
        is_external_device = kind in (1, 3)
        if not is_external_device:
            return

        try:
            room_id = uuid.UUID(data.room.name)
        except ValueError:
            return

        try:
            room = models.Room.objects.get(id=room_id)
        except models.Room.DoesNotExist:
            return

        # Live encryption: is_encrypted set AND not currently paused.
        # If the admin has already paused encryption, the gateway will bridge
        # the call normally — no need to surface a blocked notification.
        if not room.is_encrypted or room.encryption_paused:
            return

        # 1. Broadcast a system notice — frontends decode this on the
        #    "encryption-state" or notifications channel and show a snackbar.
        try:
            utils.notify_participants(
                room_name=str(room_id),
                notification_data={
                    "type": "external_device_blocked",
                    "participant_identity": participant.identity,
                    "participant_name": participant.name or participant.identity,
                },
            )
        except utils.NotificationError:
            logger.exception(
                "Failed to notify room about blocked external device"
            )

        # No eject. The gateway reads LiveKit room metadata
        # (`{is_encrypted, encryption_paused}` — see `Room.save()`) and stays
        # in placeholder-prompt mode for the SIP leg as long as encryption is
        # live. When the admin sets encryption_paused=true, the gateway
        # transitions to a normal bridge without dropping the call.

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

        # Now that the LiveKit room object exists, push the encryption flags
        # into its metadata so the SIP gateway can read them as soon as a SIP
        # caller joins. Room.save() also tries this on every change, but at
        # *creation* time the LiveKit room didn't exist yet — this is the
        # first reliable opportunity.
        try:
            utils.update_room_metadata(
                str(room_id),
                {
                    "is_encrypted": bool(room.is_encrypted),
                    "encryption_paused": bool(room.encryption_paused),
                },
            )
        except utils.MetadataUpdateException as e:
            logger.exception("Failed to seed encryption metadata: %s", e)

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
