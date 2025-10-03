"""Recording-related LiveKit Events Service"""

import asyncio
import logging
from logging import getLogger

from django.core.exceptions import ObjectDoesNotExist
from django.db import DatabaseError, transaction

import aiohttp

from core import models, utils
from core.api.feature_flag import FeatureFlag
from core.services.metadata import MetadataService

logging.basicConfig(level=logging.DEBUG)

logger = getLogger(__name__)


class RecordingEventsError(Exception):
    """Recording event handling fails."""


def get_recording_creator_id(recording: models.Recording) -> str | None:
    """Get the user ID of the recording creator (owner)."""
    owner = (
        models.RecordingAccess.objects.select_related("user")
        .filter(
            role=models.RoleChoices.OWNER,
            recording_id=recording.id,
        )
        .first()
    )
    return str(owner.user.id)


class RecordingEventsService:
    """Handles recording-related Livekit webhook events."""

    @staticmethod
    def handle_limit_reached(recording):
        """Stop recording and notify participants when limit is reached."""

        recording.status = models.RecordingStatusChoices.STOPPED
        recording.save()

        notification_mapping = {
            models.RecordingModeChoices.SCREEN_RECORDING: "screenRecordingLimitReached",
            models.RecordingModeChoices.TRANSCRIPT: "transcriptionLimitReached",
        }

        notification_type = notification_mapping.get(recording.mode)
        if not notification_type:
            return

        try:
            utils.notify_participants(
                room_name=str(recording.room.id),
                notification_data={"type": notification_type},
            )
        except utils.NotificationError as e:
            logger.exception(
                "Failed to notify participants about recording limit reached: "
                "room=%s, recording_id=%s, mode=%s",
                recording.room.id,
                recording.id,
                recording.mode,
            )
            raise RecordingEventsError(
                f"Failed to notify participants in room '{recording.room.id}' about "
                f"recording limit reached (recording_id={recording.id})"
            ) from e

    @staticmethod
    def handle_egress_started(recording):
        """Start metadata agent after transaction commit."""
        rec_id = recording.id
        room_id = recording.room_id
        creator_id = get_recording_creator_id(recording)
        if not FeatureFlag.flag_is_active("metadata_agent", distinct_id=creator_id):
            logger.info("Metadata agent disabled by PostHog flag for id=%s", creator_id)
            return

        service = MetadataService()

        logger.info(
            "Scheduling metadata start for recording=%s room_id=%s", rec_id, room_id
        )

        def _start():
            """Start metadata agent after transaction commit."""
            try:
                rec = (
                    models.Recording.objects.select_related("room")
                    .only("id", "status", "room_id", "room__id")
                    .get(id=rec_id)
                )

                if rec.status not in (
                    models.RecordingStatusChoices.INITIATED,
                    models.RecordingStatusChoices.ACTIVE,
                ):
                    logger.info(
                        "Skip metadata start: status=%s (rec=%s)", rec.status, rec.id
                    )
                    return

                room = rec.room

                if room.pk != room_id:
                    logger.error(
                        "Room mismatch at start: rec.room_id=%s event.room_id=%s",
                        room.pk,
                        room_id,
                    )
                    return

                dispatch_id = service.start_metadata(room, rec_id)
                rec.metadata_dispatch_id = dispatch_id
                rec.save(update_fields=["metadata_dispatch_id"])
                logger.info(
                    "Metadata start dispatched for rec=%s room_id=%s", rec.id, room.pk
                )
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                logger.warning(
                    "Controller unreachable during start (rec=%s, room_id=%s): %s",
                    rec_id,
                    room_id,
                    e,
                    exc_info=True,
                )

        transaction.on_commit(_start, robust=True)

    @staticmethod
    def handle_egress_ended(recording):
        """Stop metadata agent after transaction commit."""
        service = MetadataService()
        rec_id = recording.id
        room_id = recording.room_id

        def _stop():
            try:
                rec = (
                    models.Recording.objects.select_related("room")
                    .only("id", "room_id", "room__id")
                    .get(id=rec_id)
                )
                room = rec.room

                if room.pk != room_id:
                    logger.error(
                        "Room mismatch at stop: rec.room_id=%s event.room_id=%s",
                        room.pk,
                        room_id,
                    )
                    return

                try:
                    service.stop_metadata(room, rec.metadata_dispatch_id)
                    logger.info(
                        "Metadata stop dispatched for rec=%s room_id=%s",
                        rec.id,
                        room.pk,
                    )
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    logger.warning(
                        "Controller unreachable during stop (rec=%s room_id=%s): %s",
                        rec_id,
                        room_id,
                        e,
                        exc_info=True,
                    )

            except ObjectDoesNotExist as e:
                logger.warning(
                    "Recording or Room not found while stopping (rec=%s room_id=%s): %s",
                    rec_id,
                    room_id,
                    e,
                    exc_info=True,
                )
            except DatabaseError as e:
                logger.warning(
                    "DB error while stopping metadata (rec=%s room_id=%s): %s",
                    rec_id,
                    room_id,
                    e,
                    exc_info=True,
                )

        transaction.on_commit(_stop, robust=True)
