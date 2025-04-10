"""Service to notify external services when a new recording is ready."""

import logging
import smtplib

from django.conf import settings
from django.template.loader import render_to_string
from django.utils.translation import get_language, override
from django.utils.translation import gettext_lazy as _
from django.contrib.sites.models import Site
from django.core.mail import send_mail

import requests

from core import models

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for processing recordings and notifying external services."""

    def notify_external_services(self, recording):
        """Process a recording based on its mode."""

        if recording.mode == models.RecordingModeChoices.TRANSCRIPT:
            return self._notify_summary_service(recording)

        if recording.mode == models.RecordingModeChoices.SCREEN_RECORDING:
            return self._notify_user_by_email(recording)

        logger.error(
            "Unknown recording mode %s for recording %s",
            recording.mode,
            recording.id,
        )
        return False

    @staticmethod
    def _notify_user_by_email(recording) -> bool:
        """Wip."""

        # subject
        # emails
        domain = Site.objects.get_current().domain

        owner_accesses = (
            models.RecordingAccess.objects.select_related("user")
            .filter(
                role=models.RoleChoices.OWNER,
                recording_id=recording.id,
            )
            .all()
        )

        if not owner_accesses:
            logger.error("No owner found for recording %s", recording.id)
            return False

        language = get_language()

        context = (
            {
                "brandname": settings.EMAIL_BRAND_NAME,
                "support_email": settings.EMAIL_SUPPORT_EMAIL,
                "logo_img": settings.EMAIL_LOGO_IMG,
                "domain": domain,
                "room_name": recording.room.name,
                "recording_date": recording.created_at.strftime("%A %d %B %Y"),
                "recording_time": recording.created_at.strftime("%H:%M"),
                "link": f"{domain}/recordings/{recording.id}",
            }
        )

        emails = [access.user.email for access in owner_accesses]

        with override(language):
            msg_html = render_to_string("mail/html/screen_recording.html", context)
            msg_plain = render_to_string("mail/text/screen_recording.txt", context)
            subject = str(_("Your recording is ready"))  # Force translation

            try:
                send_mail(
                    subject.capitalize(),
                    msg_plain,
                    settings.EMAIL_FROM,
                    emails,
                    html_message=msg_html,
                    fail_silently=False,
                )
            except smtplib.SMTPException as exception:
                logger.error("notification to %s was not sent: %s", emails, exception)
                return False

        return True


    @staticmethod
    def _notify_summary_service(recording):
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

        if not owner_access:
            logger.error("No owner found for recording %s", recording.id)
            return False

        payload = {
            "filename": recording.key,
            "email": owner_access.user.email,
            "sub": owner_access.user.sub,
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
        except requests.HTTPError as exc:
            logger.exception(
                "Summary service HTTP error for recording %s. URL: %s. Exception: %s",
                recording.id,
                settings.SUMMARY_SERVICE_ENDPOINT,
                exc,
            )
            return False

        return True


notification_service = NotificationService()
