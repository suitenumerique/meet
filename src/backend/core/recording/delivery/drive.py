"""Push a finished recording to the Drive of the user who started it.

The recording is streamed from the object storage to Drive, into a dedicated
folder, then shared with the room's owners and administrators, as copied when
the recording started. Only the starter is emailed. Nothing falls back to the
download email when the push fails: the object storage copy stays until it
expires.
"""

import logging
import time

from django.conf import settings
from django.utils.translation import get_language, gettext_noop

import requests
from celery.exceptions import OperationalError as CeleryOperationalError

from core import audit, auditing, models, utils
from core.recording.delivery.credentials import get_provider
from core.services.drive import API_TIMEOUT, DriveClient, DriveError
from core.tasks.mail import send_email

logger = logging.getLogger(__name__)

# (connect, read) timeouts for the download, in seconds. The read one has to
# accommodate a whole recording being relayed.
DOWNLOAD_TIMEOUT = (API_TIMEOUT[0], 1800)

# Role the room's owners and administrators get on the pushed file.
SHARE_ROLE = "owner"

def release_token(delivery: models.RecordingDelivery) -> None:
    """Let go of the delivery's token, without saving: it is a user credential.

    The token is dropped even if releasing it with its provider fails.
    """

    token = delivery.get_token()
    if token and delivery.token_type:
        try:
            get_provider(delivery.token_type).release(token)
        except Exception:  # noqa: BLE001 # pylint: disable=broad-exception-caught
            logger.warning(
                "Could not release the token of recording %s",
                delivery.recording_id,
                exc_info=True,
            )

    delivery.token = None
    delivery.token_expires_at = None


def audit_push(delivery: models.RecordingDelivery, *, error=None, **details) -> None:
    """Record the outcome of a push to Drive."""

    outcome = audit.Outcome.SUCCESS
    reason = None
    if error is not None:
        outcome = audit.Outcome.FAILURE
        reason = (
            audit.Reason.AUTHENTICATION_FAILED
            if getattr(error, "status_code", None) in (401, 403)
            else audit.Reason.INTERNAL_ERROR
        )

    audit.log(
        auditing.RECORDING_DRIVE_PUSH,
        actor=None,
        actor_type=audit.ActorType.SYSTEM,
        target=delivery.recording,
        target_service="drive",
        outcome=outcome,
        reason=reason,
        error=str(error) if error is not None else None,
        token_type=delivery.token_type,
        **details,
    )


def fail(delivery: models.RecordingDelivery, error) -> None:
    """Clean up and log after pushing recording has failed. Notify the audit log.

    A recording already uploaded stays UPLOADED: it is in Drive, only sharing
    or announcing it failed.
    """

    logger.error(
        "Failed to push recording %s to Drive: %s", delivery.recording_id, error
    )

    release_token(delivery)
    if delivery.status != models.RecordingDeliveryStatusChoices.UPLOADED:
        delivery.status = models.RecordingDeliveryStatusChoices.FAILED
    delivery.error = str(error)
    delivery.save()

    audit_push(delivery, error=error)


def build_filename(recording: models.Recording, user) -> str:
    """Return the name of the file in Drive, dated in the user's timezone."""

    created_at = recording.created_at
    if user is not None:
        created_at = created_at.astimezone(user.timezone)

    return f"{recording.room.slug}-{created_at:%Y-%m-%d-%H-%M}.{recording.extension}"


def get_or_create_folder(drive: DriveClient) -> dict:
    """Return the user's recordings folder, at the root of their Drive."""

    name = settings.RECORDING_DRIVE_FOLDER_NAME
    return drive.find_root_folder(name) or drive.create_folder(name)


def upload(drive: DriveClient, recording: models.Recording, filename, parent_id) -> str:
    """Stream the recording from the object storage to a new file, return its ID.

    The recording is never held as a whole in memory or on disk. A file left
    incomplete by a failure is deleted, if Drive allows it.
    """

    download_url = utils.generate_download_s3_url(
        recording.key,
        expires_in=settings.RECORDING_DRIVE_SIGNED_URL_EXPIRY_SECONDS,
        override_domain=False,
    )

    download_error = "Could not download the recording from the object storage"
    try:
        download = requests.get(download_url, stream=True, timeout=DOWNLOAD_TIMEOUT)
    except requests.RequestException as exc:
        raise DriveError.from_request_exception(download_error, exc) from exc

    with download:
        try:
            download.raise_for_status()
        except requests.RequestException as exc:
            raise DriveError.from_request_exception(download_error, exc) from exc

        content_length = download.headers.get("Content-Length")
        if content_length is None:
            raise DriveError(
                "Object storage did not return the recording size, "
                "cannot stream it to Drive."
            )

        item = drive.create_file(filename=filename, parent_id=parent_id)

        try:
            drive.upload_content(
                policy_url=item["policy"],
                stream=download.raw,
                content_length=int(content_length),
                content_type=download.headers.get(
                    "Content-Type", "application/octet-stream"
                ),
            )
            drive.complete_upload(item["id"])
        except DriveError:
            try:
                drive.delete_item(item["id"])
            except DriveError:
                logger.warning(
                    "Could not delete the incomplete Drive item %s of recording %s",
                    item["id"],
                    recording.id,
                )
            raise

    return item["id"]


def get_share_recipients(delivery: models.RecordingDelivery) -> list[str]:
    """Return the emails to share the file with: the recording owners but the starter.

    Recording owners are the room's owners and administrators when the
    recording started, see `Recording.grant_initial_accesses`.
    """

    accesses = (
        models.RecordingAccess.objects.filter(
            recording_id=delivery.recording_id,
            role=models.RoleChoices.OWNER,
            user__isnull=False,
        )
        .exclude(user_id=delivery.user_id)
        .select_related("user")
        .order_by("created_at")
    )
    return [access.user.email for access in accesses if access.user.email]


def share(drive: DriveClient, delivery: models.RecordingDelivery) -> list[str]:
    """Share the file with the recording owners, return the emails it failed for."""

    failures = []

    for email in get_share_recipients(delivery):
        try:
            drive.share_with_email(str(delivery.drive_item_id), email, SHARE_ROLE)
        except DriveError as exc:
            logger.warning(
                "Could not share recording %s with %s in Drive: %s",
                delivery.recording_id,
                email,
                exc,
            )
            failures.append(email)

    return failures


def notify_starter(delivery: models.RecordingDelivery) -> None:
    """Email the user who started the recording a link to the file in Drive."""

    user = delivery.user
    if user is None or not user.email:
        logger.warning("No one to tell recording %s is in Drive", delivery.recording_id)
        return

    recording = delivery.recording
    local_created_at = recording.created_at.astimezone(user.timezone)

    try:
        send_email.delay(
            template="recording_saved_to_drive",
            subject=gettext_noop("Your recording is in your Drive"),
            recipients=[user.email],
            language=user.language or get_language(),
            context={
                "room_name": recording.room.name,
                "recording_date": local_created_at.strftime("%Y-%m-%d"),
                "recording_time": local_created_at.strftime("%H:%M"),
                "folder_name": settings.RECORDING_DRIVE_FOLDER_NAME,
                "link": delivery.drive_url,
            },
        )
    except (OSError, CeleryOperationalError):
        logger.exception(
            "Could not email the starter of recording %s", delivery.recording_id
        )


def push(delivery: models.RecordingDelivery) -> None:
    """Push the recording to Drive, share it, then email the starter.

    Raises:
        DriveError: the recording is not in Drive. The token is kept, to try
            again later.
    """

    token = delivery.get_token()
    if token is None:
        raise DriveError("No token left to call Drive with.")

    if delivery.is_token_expired:
        raise DriveError("The token to call Drive with has expired.")

    recording = delivery.recording

    with DriveClient(token) as drive:
        folder = get_or_create_folder(drive)
        delivery.drive_item_id = upload(
            drive, recording, build_filename(recording, delivery.user), folder["id"]
        )
        delivery.status = models.RecordingDeliveryStatusChoices.UPLOADED
        delivery.error = ""
        delivery.save()

        share_failures = share(drive, delivery)

    release_token(delivery)
    if share_failures:
        delivery.error = f"Could not share with: {', '.join(share_failures)}"
    else:
        delivery.status = models.RecordingDeliveryStatusChoices.DELIVERED
    delivery.save()

    logger.info(
        "Recording %s pushed to Drive (item %s)",
        recording.id,
        delivery.drive_item_id,
    )
    audit_push(
        delivery,
        drive_item_id=str(delivery.drive_item_id),
        share_failures=len(share_failures) or None,
    )
    notify_starter(delivery)
