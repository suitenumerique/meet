"""Worker services in charge of recording a room."""

# pylint: disable=no-member

import logging

from asgiref.sync import async_to_sync
from livekit import api as livekit_api

from ... import utils
from ..enums import FileExtension
from .exceptions import WorkerConnectionError, WorkerRequestError, WorkerResponseError
from .factories import WorkerServiceConfig

logger = logging.getLogger(__name__)


class BaseEgressService:
    """Base egress defining common methods to manage and interact with LiveKit egress processes."""

    def __init__(self, config: WorkerServiceConfig):
        self._config = config
        self._s3 = livekit_api.S3Upload(**config.bucket_args)

    def _get_filepath(self, filename: str, extension: str) -> str:
        """Construct the file path for a given filename and extension.
        Insecure method, doesn't handle paths robustly and securely.
        """
        return f"{self._config.output_folder}/{filename}.{extension}"

    @async_to_sync
    async def _handle_request(self, request, method_name: str):
        """Handle making a request to the LiveKit API and returns the response."""

        lkapi = utils.create_livekit_client(self._config.server_configurations)

        # ruff: noqa: SLF001
        # pylint: disable=protected-access
        method = getattr(lkapi._egress, method_name)

        try:
            response = await method(request)
            return response
        except livekit_api.TwirpError as e:
            raise WorkerConnectionError(
                f"LiveKit client connection error, {e.message}."
            ) from e
        except Exception as e:
            raise WorkerConnectionError(
                f"Unexpected error during LiveKit client connection: {str(e)}"
            ) from e

        finally:
            await lkapi.aclose()

    @staticmethod
    def _log_egress_error(response, event: str):
        """Log the reason LiveKit reported an unsuccessful egress on stop.

        Mirrors the logging done in the 'egress_ended' webhook. The
        StopEgress response carries the same error fields.
        """
        logger.error(
            "Egress %s on stop (egress_id=%s, status=%s): %s (error_code=%s)",
            event,
            response.egress_id,
            livekit_api.EgressStatus.Name(response.status),
            response.error or "no error reported",
            response.error_code or "no error_code reported",
        )

    def stop(self, worker_id: str) -> str:
        """Stop an ongoing egress worker.
        The StopEgressRequest is shared among all types of egress,
        so a single implementation in the base class should be sufficient.
        """

        request = livekit_api.StopEgressRequest(
            egress_id=worker_id,
        )

        response = self._handle_request(request, "stop_egress")

        if not response.status:
            raise WorkerResponseError(
                "LiveKit response is missing the recording status."
            )

        if response.status == livekit_api.EgressStatus.EGRESS_ENDING:
            return "STOPPED"

        if response.status == livekit_api.EgressStatus.EGRESS_LIMIT_REACHED:
            return "STOPPED"

        # Cases below should be very infrequent as status changes should be
        # received and processed by `handle_ended`, thus `stop` would not
        # be called (unless failure and stop are very close in time).
        # We therefore accept not to notify the user in this code branch.
        # This could be fixed in a future refactoring.
        if response.status == livekit_api.EgressStatus.EGRESS_ABORTED:
            self._log_egress_error(response, "aborted")
            return "ABORTED"

        if response.status == livekit_api.EgressStatus.EGRESS_FAILED:
            self._log_egress_error(response, "failed")
            return "FAILED"

        self._log_egress_error(response, "failed to stop")
        return "FAILED_TO_STOP"

    def start(self, room_name, recording_id, encoding_options=None):
        """Start the egress process for a recording (not implemented in the base class).
        Each derived class must implement this method, providing the necessary parameters for
        its specific egress type (e.g. audio_only, streaming output).
        """
        raise NotImplementedError("Subclass must implement this method.")

    def _resolve_encoding_options(self, encoding_options):
        """Build a LiveKit EncodingOptions from a resolved kwargs dict, or None.

        ``encoding_options`` is the per-recording dict persisted by the API in
        ``recording.options["encoding"]["resolved"]``; it falls back to the
        default encoding carried by the service config.

        When None is returned, the caller should omit the `advanced` field so
        LiveKit Egress falls back to its built-in preset (H264_720P_30).
        """
        encoding_options = encoding_options or self._config.encoding_options
        if not encoding_options:
            return None

        try:
            return livekit_api.EncodingOptions(**encoding_options)
        except (TypeError, ValueError) as e:
            # Protobuf raises TypeError on a wrongly typed value (e.g. a float
            # framerate) and ValueError on an unknown field or an out-of-range int.
            raise WorkerRequestError(f"Invalid encoding options: {e}") from e


class VideoCompositeEgressService(BaseEgressService):
    """Record multiple participant video and audio tracks into a single output '.mp4' file."""

    hrid = "video-recording-composite-livekit-egress"

    def start(self, room_name, recording_id, encoding_options=None):
        """Start the video composite egress process for a recording."""

        # Save room's recording as a mp4 video file.
        file_type = livekit_api.EncodedFileType.MP4
        filepath = self._get_filepath(
            filename=recording_id, extension=FileExtension.MP4.value
        )

        file_output = livekit_api.EncodedFileOutput(
            file_type=file_type,
            filepath=filepath,
            s3=self._s3,
        )

        request_kwargs = {
            "room_name": room_name,
            "file_outputs": [file_output],
            "layout": "speaker-light",
        }

        advanced = self._resolve_encoding_options(encoding_options)
        if advanced is not None:
            request_kwargs["advanced"] = advanced

        request = livekit_api.RoomCompositeEgressRequest(**request_kwargs)

        response = self._handle_request(request, "start_room_composite_egress")

        if not response.egress_id:
            raise WorkerResponseError("Egress ID not found in the response.")

        return response.egress_id


class AudioCompositeEgressService(BaseEgressService):
    """Record multiple participant audio tracks into a single output '.ogg' file."""

    hrid = "audio-recording-composite-livekit-egress"

    def start(self, room_name, recording_id, encoding_options=None):
        """Start the audio composite egress process for a recording.

        ``encoding_options`` is accepted for signature compatibility with the
        WorkerService protocol but ignored: audio-only egress has no
        encoding to configure.
        """

        # Save room's recording as an ogg audio file.
        file_type = livekit_api.EncodedFileType.OGG
        filepath = self._get_filepath(
            filename=recording_id, extension=FileExtension.OGG.value
        )

        file_output = livekit_api.EncodedFileOutput(
            file_type=file_type,
            filepath=filepath,
            s3=self._s3,
        )

        request = livekit_api.RoomCompositeEgressRequest(
            room_name=room_name, file_outputs=[file_output], audio_only=True
        )

        response = self._handle_request(request, "start_room_composite_egress")

        if not response.egress_id:
            raise WorkerResponseError("Egress ID not found in the response.")

        return response.egress_id
