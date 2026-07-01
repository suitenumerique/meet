"""Service to notify external services when a new recording is ready."""

import asyncio
import json
import logging
import smtplib
import warnings
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.translation import get_language, override
from django.utils.translation import gettext_lazy as _

import aiohttp
import requests
from asgiref.sync import async_to_sync
from livekit import api as livekit_api

from core import models, utils
from core.utils import generate_download_s3_url

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
            return self._notify_summary_service(recording)

        if recording.mode == models.RecordingModeChoices.SCREEN_RECORDING:
            summary_success = True
            if recording.options.get("transcribe", False):
                summary_success = self._notify_summary_service(recording)

            email_success = self._notify_user_by_email(recording)
            return email_success and summary_success

        logger.error(
            "Unknown recording mode %s for recording %s",
            recording.mode,
            recording.id,
        )
        return False

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
    def _generate_title(
        *,
        locale: str,
        room: str,
        recording_datetime: datetime | None,
        owner_timezone: str | None,
    ) -> str:
        """Generate title from context or return default."""
        locale = (
            locale
            if locale in {"de-de", "en-us", "fr-fr", "nl-nl"}
            else settings.LANGUAGES[0][0]
        )
        default_template_by_locale = {
            "de-de": "Transkription",
            "en-us": "Transcription",
            "fr-fr": "Transcription",
            "nl-nl": "Transcriptie",
        }
        if recording_datetime is None:
            return default_template_by_locale.get(
                locale, default_template_by_locale["en-us"]
            )

        template_by_locale = {
            "de-de": 'Besprechung "{room}" am {room_recording_date} um {room_recording_time}',
            "en-us": 'Meeting "{room}" on {room_recording_date} at {room_recording_time}',
            "fr-fr": 'Réunion "{room}" du {room_recording_date} à {room_recording_time}',
            "nl-nl": 'Vergadering "{room}" op {room_recording_date} om {room_recording_time}',
        }
        template = template_by_locale.get(locale, template_by_locale["en-us"])

        dt = recording_datetime
        if owner_timezone:
            try:
                dt = recording_datetime.astimezone(ZoneInfo(owner_timezone))
            except (KeyError, ZoneInfoNotFoundError):
                pass  # Keep the original UTC datetime

        return template.format(
            room=room,
            room_recording_date=dt.strftime("%Y-%m-%d"),
            room_recording_time=dt.strftime("%H:%M"),
        )

    @staticmethod
    def _notify_summary_service(recording: models.Recording):
        """Notify summary service about a new recording."""

        if (
            not settings.SUMMARY_SERVICE_ENDPOINT
            or not settings.SUMMARY_SERVICE_API_TOKEN
        ):
            logger.error("Summary service not configured")
            return False

        owner_access = (
            models.RecordingAccess.objects.select_related("user")
            .filter(
                role=models.RoleChoices.OWNER,
                recording_id=recording.id,
            )
            .first()
        )
        metadata_filename: None | str = None
        if settings.METADATA_COLLECTOR_ENABLED and recording.options.get(
            "collect_metadata", False
        ):
            output_folder = settings.METADATA_COLLECTOR_OUTPUT_FOLDER
            metadata_filename = f"{output_folder}/{recording.id}-metadata.json"

        if not owner_access:
            logger.error("No owner found for recording %s", recording.id)
            return False

        started_at, ended_at = async_to_sync(
            NotificationService._get_recording_timestamps
        )(recording.worker_id)

        form_base_url = settings.TRANSCRIPTION_SATISFACTION_FORM_BASE_URL

        payload = {
            # Legacy V1 params to avoid a breaking change
            "owner_id": str(owner_access.user.id),
            "recording_filename": recording.key,
            "metadata_filename": metadata_filename,
            "email": owner_access.user.email,
            "sub": owner_access.user.sub,
            "room": recording.room.name,
            "owner_timezone": str(owner_access.user.timezone),
            "download_link": f"{get_recording_download_base_url()}/{recording.id}",
            "recording_start_at": (started_at.isoformat() if started_at else None),
            "recording_end_at": (ended_at.isoformat() if ended_at else None),
            # V2 params
            "user_sub": owner_access.user.sub,
            "user_email": owner_access.user.email,
            "cloud_storage_url": generate_download_s3_url(
                recording.key, expires_in=60 * 60 * 24, override_domain=False
            ),
            "language": recording.options.get("language", "fr"),
            "context_language": owner_access.user.language,
            "push_to_docs_config": {
                "user_email": owner_access.user.email,
                "title": NotificationService._generate_title(
                    locale=owner_access.user.language
                    or recording.options.get("language", "fr-fr"),
                    room=recording.room.name,
                    recording_datetime=started_at,
                    owner_timezone=str(owner_access.user.timezone),
                ),
                "download_link": f"{get_recording_download_base_url()}/{recording.id}",
                "form_link": f"{form_base_url}?room_id={recording.room.id}"
                if (form_base_url and metadata_filename is not None)
                else None,
                # For now the feature flag logic is handled on summary side
                "auto_create_summary": True,
            },
            "metadata": (
                {
                    "cloud_storage_url": generate_download_s3_url(
                        metadata_filename,
                        expires_in=60 * 60 * 24,
                        override_domain=False,
                    ),
                    "started_at": started_at.isoformat(),
                    "ended_at": ended_at.isoformat(),
                }
                if (started_at and ended_at and metadata_filename)
                else None
            ),
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.SUMMARY_SERVICE_API_TOKEN}",
        }

        try:
            response = requests.post(
                settings.SUMMARY_SERVICE_ENDPOINT,
                json=payload,
                headers=headers,
                timeout=30,
            )
            response.raise_for_status()
            is_v2_implementation = False
            try:
                response_json = response.json()
                # We do not require a job_id to avoid a breaking change
                if job_id := response_json.get("job_id"):
                    recording.external_process_id = job_id
                    recording.save()
                    is_v2_implementation = True
            except json.JSONDecodeError:
                logger.debug(
                    "Summary service response for recording %s is not valid JSON; "
                    "falling back to legacy handling.",
                    recording.id,
                )

            if not is_v2_implementation:
                warnings.warn(
                    "You are likely using your own implementation for the summary / "
                    "transcribe service."
                    "We have released a new version and API contract for that service, "
                    "we recommend checking it out"
                    # pylint: disable=line-too-long
                    "https://github.com/suitenumerique/meet/blob/19c2a378e7e66652afbfa3e749badd697e3917ac/src/summary/summary/api/route/tasks_v2.py "
                    "and mimicking it's behavior. We will remove the legacy "
                    "handling in a future version.",
                    DeprecationWarning,
                    stacklevel=2,
                )

        except requests.RequestException as exc:
            logger.exception(
                "Summary service error for recording %s. URL: %s. Exception: %s",
                recording.id,
                settings.SUMMARY_SERVICE_ENDPOINT,
                exc,
            )
            return False

        return True


notification_service = NotificationService()
