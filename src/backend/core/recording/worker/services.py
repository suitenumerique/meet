"""Worker services in charge of recording a room."""

# pylint: disable=no-member

from asgiref.sync import async_to_sync
from livekit import api as livekit_api

from ... import utils
from ..enums import FileExtension
from .exceptions import WorkerConnectionError, WorkerResponseError
from .factories import WorkerServiceConfig


class LiveKitAPIClient:
    """Handles all LiveKit API communication including client creation and request execution."""

    def __init__(self, server_configurations):
        self._server_configurations = server_configurations

    @async_to_sync
    async def execute_request(self, request, method_name: str):
        """Execute a LiveKit API request and return the response."""

        lkapi = utils.create_livekit_client(self._server_configurations)

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


class BaseEgressService:
    """Base egress defining common methods to manage and interact with LiveKit egress processes."""

    def __init__(self, config: WorkerServiceConfig):
        self._config = config
        self._s3 = livekit_api.S3Upload(**config.bucket_args)
        self._api_client = LiveKitAPIClient(config.server_configurations)

    def _get_filepath(self, filename: str, extension: str) -> str:
        """Construct the file path for a given filename and extension.
        Unsecure method, doesn't handle paths robustly and securely.
        """
        return f"{self._config.output_folder}/{filename}.{extension}"

    def _handle_request(self, request, method_name: str):
        """Execute a LiveKit API request and return the response."""
        return self._api_client.execute_request(request, method_name)

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

        # To avoid exposing EgressStatus values and coupling with LiveKit outside of this class,
        # the response status is mapped to simpler "ABORTED", "STOPPED" or "FAILED_TO_STOP" strings.
        if response.status == livekit_api.EgressStatus.EGRESS_ABORTED:
            return "ABORTED"

        if response.status == livekit_api.EgressStatus.EGRESS_ENDING:
            return "STOPPED"

        return "FAILED_TO_STOP"

    def start(self, room_name, recording_id):
        """Start the egress process for a recording (not implemented in the base class).
        Each derived class must implement this method, providing the necessary parameters for
        its specific egress type (e.g. audio_only, streaming output).
        """
        raise NotImplementedError("Subclass must implement this method.")


class VideoCompositeEgressService(BaseEgressService):
    """Record multiple participant video and audio tracks into a single output '.mp4' file."""

    hrid = "video-recording-composite-livekit-egress"

    def start(self, room_name, recording_id):
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

        request = livekit_api.RoomCompositeEgressRequest(
            room_name=room_name, file_outputs=[file_output], layout="speaker-light"
        )

        response = self._handle_request(request, "start_room_composite_egress")

        if not response.egress_id:
            raise WorkerResponseError("Egress ID not found in the response.")

        return response.egress_id


class AudioCompositeEgressService(BaseEgressService):
    """Record multiple participant audio tracks into a single output '.ogg' file."""

    hrid = "audio-recording-composite-livekit-egress"

    def start(self, room_name, recording_id):
        """Start the audio composite egress process for a recording."""

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
