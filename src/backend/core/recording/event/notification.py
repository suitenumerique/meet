"""Service to notify external services when a new recording is ready."""

import logging

from django.conf import settings

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
            logger.warning(
                "Screen recording mode not implemented for recording %s", recording.id
            )
            return False

        logger.error(
            "Unknown recording mode %s for recording %s",
            recording.mode,
            recording.id,
        )
        return False

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
