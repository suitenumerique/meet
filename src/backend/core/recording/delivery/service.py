"""Choose how a recording is delivered when it starts, carry it out when it ends.

Only video recordings are concerned: an audio-only transcript ends up in Docs,
through the summary service. A video recording without a delivery, started
before deliveries existed, is delivered by email.
"""

import logging

from django.conf import settings
from django.utils import timezone

from celery.exceptions import OperationalError as CeleryOperationalError

from core import audit, auditing, models
from core.recording.delivery.credentials import CredentialError, get_from_session
from core.tasks.push_recording import push_recording_to_drive

logger = logging.getLogger(__name__)

Method = models.RecordingDeliveryMethodChoices
Status = models.RecordingDeliveryStatusChoices


def prepare(request, recording: models.Recording) -> models.RecordingDelivery | None:
    """Pick how a recording that starts will be delivered, and get what it needs.

    Pushing to Drive needs a token to call it on behalf of the user, copied from
    their session. Without one, the recording still starts: it will be delivered
    by email if RECORDING_DRIVE_EMAIL_FALLBACK_ENABLED, or not at all.
    """

    if recording.mode != models.RecordingModeChoices.SCREEN_RECORDING:
        return None

    delivery = models.RecordingDelivery(
        recording=recording,
        user=request.user,
        method=settings.RECORDING_STORAGE_METHOD,
    )

    if delivery.method == Method.DRIVE:
        token_type = settings.RECORDING_DRIVE_AUTH_METHOD
        try:
            credential = get_from_session(request)
        except CredentialError as exc:
            logger.warning(
                "Error getting Drive credentials for recording %s: %s",
                recording.id,
                exc,
            )
            delivery.error = str(exc)
            if settings.RECORDING_DRIVE_EMAIL_FALLBACK_ENABLED:
                delivery.method = Method.S3_EMAIL
            else:
                delivery.token_type = token_type
                delivery.status = Status.FAILED
            audit.log(
                auditing.RECORDING_DRIVE_PUSH,
                target=recording,
                target_service="drive",
                outcome=audit.Outcome.FAILURE,
                reason=audit.Reason.AUTHENTICATION_FAILED,
                error=str(exc),
                token_type=token_type,
                delivery_method=delivery.method,
            )
        else:
            delivery.token_type = token_type
            delivery.set_token(credential.value, credential.expires_at)

    delivery.save()
    return delivery


def get_method(recording: models.Recording) -> str:
    """Return how a finished video recording is delivered."""

    try:
        return recording.delivery.method
    except models.RecordingDelivery.DoesNotExist:
        return Method.S3_EMAIL


def dispatch_to_drive(recording: models.Recording) -> bool:
    """Hand the push of a finished recording over to a worker.

    Returns whether the recording is in Drive or on its way there.
    """

    delivery = recording.delivery

    if delivery.status == Status.FAILED:
        logger.warning(
            "Recording %s cannot be pushed to Drive: %s", recording.id, delivery.error
        )
        return False

    # Only a PENDING delivery is pushed, so it can never be pushed
    # twice, e.g. if an administrator resends the notifications of a recording.
    claimed = models.RecordingDelivery.objects.filter(
        pk=delivery.pk, status=Status.PENDING
    ).update(status=Status.PUSHING, updated_at=timezone.now())

    if not claimed:
        logger.info(
            "Recording %s is already %s, not pushing it to Drive again",
            recording.id,
            delivery.status,
        )
        return True

    try:
        push_recording_to_drive.delay(str(recording.id))
    except CeleryOperationalError:
        logger.exception(
            "Could not schedule the Drive push of recording %s", recording.id
        )
        # Keep the token: resending the notification tries again
        models.RecordingDelivery.objects.filter(pk=delivery.pk).update(
            status=Status.PENDING, updated_at=timezone.now()
        )
        return False

    return True


def abandon(recording: models.Recording, reason: str) -> None:
    """Update delivery status and drop the token."""

    try:
        delivery = recording.delivery
    except models.RecordingDelivery.DoesNotExist:
        return

    if delivery.status != Status.PENDING:
        return

    delivery.drop_token()
    delivery.status = Status.FAILED
    delivery.error = reason
    delivery.save()
