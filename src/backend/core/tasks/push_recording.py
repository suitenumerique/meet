"""Task pushing a finished recording to its owner's Drive."""

import logging

from django.conf import settings

import requests

from core import models, utils
from core.services.drive import API_TIMEOUT, DriveClient, DriveError
from core.tasks._task import task

logger = logging.getLogger(__name__)

# (connect, read) timeouts for the download, in seconds. The read one has to
# accommodate a whole recording being relayed.
DOWNLOAD_TIMEOUT = (API_TIMEOUT[0], 1800)


def _build_filename(recording: models.Recording) -> str:
    """Return a filename for the Drive item."""

    return (
        f"{recording.room.slug}-"
        f"{recording.created_at:%Y-%m-%d-%H-%M}."
        f"{recording.extension}"
    )


@task
def push_recording(recording_id: str) -> bool:
    """Push a recording to the Drive of the user who started it.

    The recording is streamed from object storage to Drive's presigned
    URL. It is NOT fully downloaded to the worker's disk or memory.

    The access token stored when the recording started is consumed here and
    dropped afterwards whatever the outcome.

    Mostly taken from: https://github.com/suitenumerique/drive/blob/main/docs/resource_server.md
    """

    try:
        recording = models.Recording.objects.select_related("room").get(pk=recording_id)
    except models.Recording.DoesNotExist:
        logger.error(
            "Recording %s does not exist, cannot push it to Drive", recording_id
        )
        return False

    access_token = recording.get_owner_access_token()

    if not access_token:
        logger.error(
            "No access token stored for recording %s, cannot push it to Drive. "
            "Was OIDC_STORE_ACCESS_TOKEN enabled when the recording started?",
            recording_id,
        )
        return False

    download_url = utils.generate_download_s3_url(
        recording.key,
        expires_in=settings.RECORDING_PUSH_TO_DRIVE_SIGNED_URL_EXPIRY_SECONDS,
        override_domain=False,
    )
    filename = _build_filename(recording)

    try:
        with DriveClient(access_token) as drive:
            item = drive.create_file(filename=filename)

            # The bytes are relayed chunk by chunk: the recording is never held
            # in memory as a whole.
            with requests.get(
                download_url, stream=True, timeout=DOWNLOAD_TIMEOUT
            ) as download:
                download.raise_for_status()

                content_length = download.headers.get("Content-Length")
                if content_length is None:
                    raise DriveError(
                        "Object storage did not return the recording size, "
                        "cannot stream it to Drive."
                    )

                drive.upload_content(
                    policy_url=item["policy"],
                    stream=download.raw,
                    content_length=int(content_length),
                    content_type=download.headers.get(
                        "Content-Type", "application/octet-stream"
                    ),
                )

            drive.complete_upload(item["id"])

    except (DriveError, requests.RequestException):
        logger.exception("Failed to push recording %s to Drive", recording_id)
        return False

    finally:
        recording.clear_owner_access_token()

    logger.info(
        "Recording %s pushed to Drive as '%s' (item %s)",
        recording_id,
        filename,
        item["id"],
    )
    return True
