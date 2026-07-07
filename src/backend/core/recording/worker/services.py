"""Worker services in charge of recording a room."""

# pylint: disable=no-member

from django.conf import settings

from asgiref.sync import async_to_sync
from livekit import api as livekit_api

from ... import utils
from ..enums import FileExtension
from .exceptions import WorkerConnectionError, WorkerResponseError
from .factories import WorkerServiceConfig


def resolve_encoding_config(encoding_config):
    """Resolve a per-recording EncodingConfig to concrete encoding fields.

    Returns a JSON-serializable dict of the LiveKit ``EncodingOptions`` kwargs
    derived from the request's resolution / profile, or None when no
    encoding_config is provided. This allows to derive width, height, fps, and
    bitrate from (resolution, profile).

    Only the fields that can actually be resolved are included: width/height
    require a resolution, framerate/video_bitrate require both a resolution and a
    profile.
    """
    if encoding_config is None:
        return None

    resolution = encoding_config.resolution
    profile = encoding_config.profile

    resolved = {
        "key_frame_interval": settings.RECORDING_ENCODING_KEY_FRAME_INTERVAL_S,
    }

    if resolution:
        width, height = settings.RECORDING_ENCODING_AVAILABLE_RESOLUTIONS[resolution]
        resolved["width"] = width
        resolved["height"] = height

    if resolution and profile:
        fps, kbps_by_resolution = settings.RECORDING_ENCODING_AVAILABLE_PROFILES[
            profile
        ]
        resolved["framerate"] = fps
        resolved["video_bitrate"] = kbps_by_resolution[resolution]

    return resolved


class BaseEgressService:
    """Base egress defining common methods to manage and interact with LiveKit egress processes."""

    def __init__(self, config: WorkerServiceConfig):
        self._config = config
        self._s3 = livekit_api.S3Upload(**config.bucket_args)

    def _get_filepath(self, filename: str, extension: str) -> str:
        """Construct the file path for a given filename and extension.
        Unsecure method, doesn't handle paths robustly and securely.
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

    def start(self, room_name, recording_id, encoding_options=None):
        """Start the egress process for a recording (not implemented in the base class).
        Each derived class must implement this method, providing the necessary parameters for
        its specific egress type (e.g. audio_only, streaming output).
        """
        raise NotImplementedError("Subclass must implement this method.")

    def _build_encoding_options(self):
        """Build a LiveKit EncodingOptions from the service config, or None.

        When None is returned, the caller should omit the `advanced` field so
        LiveKit Egress falls back to its built-in preset (H264_720P_30).

        The full EncodingOptions kwargs (operator-tunable values + pinned
        codec / frequency constants) are assembled in `WorkerServiceConfig`,
        so this method is a thin protobuf adapter.
        """
        opts = self._config.encoding_options
        if not opts:
            return None

        return livekit_api.EncodingOptions(**opts)

    def _resolve_encoding_options(self, encoding_options):
        """Build LiveKit EncodingOptions from a resolved per-recording dict, or None.

        ``encoding_options`` is the dict persisted by the API in
        ``recording.options["encoding"]["resolved"]``.
        """
        if not encoding_options:
            return None

        return livekit_api.EncodingOptions(**encoding_options)


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

        advanced = (
            self._resolve_encoding_options(encoding_options)
            or self._build_encoding_options()
        )
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
