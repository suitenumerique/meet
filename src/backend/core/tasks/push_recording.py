"""Task pushing a finished recording to the Drive of the user who started it."""

import logging

from django.conf import settings

from celery.exceptions import OperationalError as CeleryOperationalError

from core import models
from core.recording.delivery import drive
from core.services.drive import DriveError
from core.tasks._task import task

logger = logging.getLogger(__name__)

# Delay before the first new attempt, in seconds, doubled at each attempt.
RETRY_BASE_DELAY = 60


@task
def push_recording_to_drive(recording_id: str, attempt: int = 1) -> bool:
    """Push a recording to Drive, see `core.recording.delivery.drive`.

    When the push fails, it is tried again later, by queuing this task again,
    up to RECORDING_DRIVE_PUSH_MAX_ATTEMPTS times and while the token is valid.
    """

    try:
        delivery = models.RecordingDelivery.objects.select_related(
            "recording__room", "user"
        ).get(recording_id=recording_id)
    except models.RecordingDelivery.DoesNotExist:
        logger.error("Recording %s has no delivery, cannot push it", recording_id)
        return False

    if delivery.status != models.RecordingDeliveryStatusChoices.PUSHING:
        logger.info(
            "Delivery of recording %s is %s, nothing to push",
            recording_id,
            delivery.status,
        )
        return False

    try:
        drive.push(delivery)
    except DriveError as exc:
        if (
            attempt < settings.RECORDING_DRIVE_PUSH_MAX_ATTEMPTS
            and not delivery.is_token_expired
        ):
            delay = RETRY_BASE_DELAY * 2 ** (attempt - 1)
            logger.warning(
                "Push of recording %s to Drive failed (attempt %d), "
                "trying again in %ds: %s",
                recording_id,
                attempt,
                delay,
                exc,
            )
            delivery.error = str(exc)
            delivery.save(update_fields=["error", "updated_at"])

            try:
                push_recording_to_drive.apply_async(
                    args=(recording_id,),
                    kwargs={"attempt": attempt + 1},
                    countdown=delay,
                )
            except CeleryOperationalError as queue_exc:
                drive.fail(delivery, queue_exc)
            return False

        drive.fail(delivery, exc)
        return False
    except Exception as exc:  # pylint: disable=broad-exception-caught
        # Not worth trying again, but the delivery must not stay PUSHING:
        # nothing would ever push it again nor drop its token.
        logger.exception("Unexpected error pushing recording %s to Drive", recording_id)
        drive.fail(delivery, exc)
        return False

    return True
