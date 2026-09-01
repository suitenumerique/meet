"""Factory, configurations and Protocol to create worker services"""

# pylint: disable=no-member

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, ClassVar, Dict, Optional, Protocol, Type

from django.conf import settings
from django.utils.module_loading import import_string

from livekit import api as livekit_api

logger = logging.getLogger(__name__)

# Codec / frequency constants matching LiveKit's H264_720P_30 preset.
# Kept fixed because changing them would shift the goal-post away from the
# "safe drop-in replacement for the default preset" contract of this feature.
_RECORDING_VIDEO_CODEC = livekit_api.VideoCodec.H264_MAIN
_RECORDING_AUDIO_CODEC = livekit_api.AudioCodec.AAC
_RECORDING_AUDIO_FREQUENCY_HZ = 48000


def _build_default_encoding_options() -> Optional[Dict[str, Any]]:
    """Build the server-wide EncodingOptions kwargs, or None to keep LiveKit's preset.

    Operator-tunable values live in Django settings; the default resolution gives
    width / height, the default profile gives framerate and video bitrate, while
    codec and frequency are pinned constants. Either default left empty means we
    use the livekit defaults.
    """

    resolution = settings.RECORDING_ENCODING_DEFAULT_RESOLUTION
    profile = settings.RECORDING_ENCODING_DEFAULT_PROFILE

    if not resolution or not profile:
        return None

    dimensions = settings.RECORDING_ENCODING_AVAILABLE_RESOLUTIONS[resolution]
    profile_spec = settings.RECORDING_ENCODING_AVAILABLE_PROFILES[profile]

    return {
        "width": dimensions["width"],
        "height": dimensions["height"],
        "framerate": profile_spec["fps"],
        "video_bitrate": profile_spec["kbps"][resolution],
        "audio_bitrate": settings.RECORDING_ENCODING_AUDIO_BITRATE_KBPS,
        "key_frame_interval": settings.RECORDING_ENCODING_KEY_FRAME_INTERVAL_S,
        "video_codec": _RECORDING_VIDEO_CODEC,
        "audio_codec": _RECORDING_AUDIO_CODEC,
        "audio_frequency": _RECORDING_AUDIO_FREQUENCY_HZ,
    }


@dataclass(frozen=True)
class WorkerServiceConfig:
    """Declare Worker Service common configurations"""

    output_folder: str
    server_configurations: Dict[str, Any]
    bucket_args: Optional[dict]
    encoding_options: Optional[Dict[str, Any]] = None

    @classmethod
    @lru_cache
    def from_settings(cls) -> "WorkerServiceConfig":
        """Load configuration from Django settings with caching for efficiency."""

        logger.debug("Loading WorkerServiceConfig from settings.")

        # Single source of truth for the EncodingOptions kwargs; the services
        # layer only unpacks this dict. Recordings carrying their own encoding
        # resolve it per request and bypass this default.
        encoding_options: Optional[Dict[str, Any]] = (
            _build_default_encoding_options()
            if settings.RECORDING_ENCODING_ENABLED
            else None
        )

        return cls(
            output_folder=settings.RECORDING_OUTPUT_FOLDER,
            server_configurations=settings.LIVEKIT_CONFIGURATION,
            bucket_args={
                "endpoint": settings.AWS_S3_ENDPOINT_URL,
                "access_key": settings.AWS_S3_ACCESS_KEY_ID,
                "secret": settings.AWS_S3_SECRET_ACCESS_KEY,
                "region": settings.AWS_S3_REGION_NAME,
                "bucket": settings.AWS_STORAGE_BUCKET_NAME,
                "force_path_style": True,
            },
            encoding_options=encoding_options,
        )


class WorkerService(Protocol):
    """Define the interface for interacting with a worker service."""

    hrid: ClassVar[str]

    def __init__(self, config: WorkerServiceConfig):
        """Initialize the service with the given configuration."""

    def start(
        self,
        room_id: str,
        recording_id: str,
        encoding_options: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Start a recording for a specified room."""

    def stop(self, worker_id: str) -> str:
        """Stop recording for a specified worker."""


def get_worker_service(mode: str) -> WorkerService:
    """Instantiate a worker service by its mode."""

    worker_registry: Dict[str, str] = settings.RECORDING_WORKER_CLASSES

    try:
        worker_class_path = worker_registry[mode]
    except KeyError as e:
        raise ValueError(
            f"Recording mode '{mode}' not found in RECORDING_WORKER_CLASSES. "
            f"Available modes: {list(worker_registry.keys())}"
        ) from e

    worker_class: Type[WorkerService] = import_string(worker_class_path)

    config = WorkerServiceConfig.from_settings()
    return worker_class(config=config)
