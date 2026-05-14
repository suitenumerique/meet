"""Service to notify external services when a new recording is ready."""

import asyncio
import logging
import smtplib
from datetime import datetime, timezone

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.translation import get_language, override
from django.utils.translation import gettext_lazy as _

import aiohttp
from asgiref.sync import async_to_sync
from livekit import api as livekit_api

from core import models, utils
from core.tasks.ai_job import call_transcribe_service

logger = logging.getLogger(__name__)


def get_recording_download_base_url() -> str:
    """Get the recording download base URL with backward compatibility."""
    new_setting = settings.RECORDING_DOWNLOAD_BASE_URL
    old_setting = settings.SCREEN_RECORDING_BASE_URL

    if old_setting:
        logger.warning(
            "SCREEN_RECORDING_BASE_URL is deprecated and will be removed in a future version. "
            "Please use RECORDING_DOWNLOAD_BASE_URL instead."
        )

    if new_setting:
        return new_setting

    return old_setting


class NotificationService:
    """Service for processing recordings and notifying external services."""

    def notify_external_services(self, recording):
        """Process a recording based on its mode."""

        if recording.mode == models.RecordingModeChoices.TRANSCRIPT:
            self._notify_summary_service(recording)
        elif recording.mode == models.RecordingModeChoices.SCREEN_RECORDING:
            if recording.options.get("transcribe", False):
                self._notify_summary_service(recording)
            self._notify_user_by_email(recording)
        else:
            logger.error(
                "Unknown recording mode %s for recording %s",
                recording.mode,
                recording.id,
            )

    @staticmethod
    def _notify_user_by_email(recording) -> bool:
        """
        Send an email notification to recording owners when their recording is ready.

        The email includes a direct link that redirects owners to a dedicated download
        page in the frontend where they can access their specific recording.
        """

        owner_accesses = (
            models.RecordingAccess.objects.select_related("user")
            .filter(
                role=models.RoleChoices.OWNER,
                recording_id=recording.id,
            )
            .order_by("created_at")
        )

        if not owner_accesses:
            logger.error("No owner found for recording %s", recording.id)
            return False

        context = {
            "brandname": settings.EMAIL_BRAND_NAME,
            "support_email": settings.EMAIL_SUPPORT_EMAIL,
            "logo_img": settings.EMAIL_LOGO_IMG,
            "domain": settings.EMAIL_DOMAIN,
            "room_name": recording.room.name,
            "recording_expiration_days": settings.RECORDING_EXPIRATION_DAYS,
            "link": f"{get_recording_download_base_url()}/{recording.id}",
        }

        has_failures = False

        # We process emails individually rather than in batch because:
        # 1. Each email requires personalization (timezone, language)
        # 2. The number of recipients per recording is typically small (not thousands)
        for access in owner_accesses:
            user = access.user
            language = user.language or get_language()
            with override(language):
                personalized_context = {
                    "recording_date": recording.created_at.astimezone(
                        user.timezone
                    ).strftime("%Y-%m-%d"),
                    "recording_time": recording.created_at.astimezone(
                        user.timezone
                    ).strftime("%H:%M"),
                    **context,
                }
                msg_html = render_to_string(
                    "mail/html/screen_recording.html", personalized_context
                )
                msg_plain = render_to_string(
                    "mail/text/screen_recording.txt", personalized_context
                )
                subject = str(_("Your recording is ready"))  # Force translation

                try:
                    send_mail(
                        subject.capitalize(),
                        msg_plain,
                        settings.EMAIL_FROM,
                        [user.email],
                        html_message=msg_html,
                        fail_silently=False,
                    )
                except smtplib.SMTPException as exception:
                    logger.error("notification could not be sent: %s", exception)
                    has_failures = True

        return not has_failures

    @staticmethod
    async def _get_recording_timestamps(worker_id):
        """Fetch FileInfo.started_at and ended_at from LiveKit's egress API.

        FileInfo.started_at is more accurate than EgressInfo.started_at because
        it reflects when file recording actually began. The started_at value exposed
        in the manifest file, as well as in the EgressInfo returned by the API,
        corresponds to when the egress service received the request, not the moment
        the egress worker effectively joined the room.

        Returns:
            Tuple of (started_at, ended_at) datetimes, either may be None.
        """

        if not worker_id:
            return None, None

        custom_configuration = {
            **settings.LIVEKIT_CONFIGURATION,
            "timeout": aiohttp.ClientTimeout(total=10),
        }
        lkapi = utils.create_livekit_client(custom_configuration=custom_configuration)
        try:
            egress_list = await lkapi.egress.list_egress(
                livekit_api.ListEgressRequest(egress_id=worker_id)  # pylint: disable=no-member
            )
        except (livekit_api.TwirpError, OSError, asyncio.TimeoutError):
            logger.exception("Could not fetch egress info for worker %s", worker_id)
            return None, None
        finally:
            await lkapi.aclose()

        if not egress_list.items or not egress_list.items[0].file_results:
            logger.debug("No file_results for worker %s", worker_id)
            return None, None

        file_result = egress_list.items[0].file_results[0]

        def _ns_to_utc(ns):
            return datetime.fromtimestamp(ns / 1e9, tz=timezone.utc) if ns else None

        return _ns_to_utc(file_result.started_at), _ns_to_utc(file_result.ended_at)

    @staticmethod
    def _notify_summary_service(recording: models.Recording):
        """Notify summary service about a new recording."""

        if (
            not settings.SUMMARY_SERVICE_ENDPOINT
            or not settings.SUMMARY_SERVICE_API_TOKEN
        ):
            logger.error("Summary service not configured")
            return

        started_at, ended_at = async_to_sync(
            NotificationService._get_recording_timestamps
        )(recording.worker_id)

        recording.started_at = started_at
        recording.ended_at = ended_at
        recording.save()

        call_transcribe_service.apply_async(args=[recording.id])


notification_service = NotificationService()
