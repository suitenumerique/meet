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


def build_encoding_options(resolution, profile):
    """Assemble the LiveKit ``EncodingOptions`` kwargs for a resolution/profile.

    Single source of truth shared by the default encoding
    (``WorkerServiceConfig.from_settings``) and the per-recording encoding
    persisted by the start-recording API, so both paths always produce the
    same shape.

    The profile-independent fields (audio bitrate, keyframe interval and the
    pinned codec / frequency constants) are always included.
    The resolution-dependent fields are added only when they can be resolved:
    width/height require a resolution; framerate/video_bitrate require both a
    resolution and a profile (a resolution-only encoding leaves framerate and
    bitrate to LiveKit's defaults).
    """
    options: Dict[str, Any] = {
        "audio_bitrate": settings.RECORDING_ENCODING_AUDIO_BITRATE_KBPS,
        "key_frame_interval": settings.RECORDING_ENCODING_KEY_FRAME_INTERVAL_S,
        "video_codec": _RECORDING_VIDEO_CODEC,
        "audio_codec": _RECORDING_AUDIO_CODEC,
        "audio_frequency": _RECORDING_AUDIO_FREQUENCY_HZ,
    }

    if resolution:
        resolution_config = settings.RECORDING_ENCODING_AVAILABLE_RESOLUTIONS[
            resolution
        ]
        options["width"] = resolution_config["width"]
        options["height"] = resolution_config["height"]

    if resolution and profile:
        profile_config = settings.RECORDING_ENCODING_AVAILABLE_PROFILES[profile]
        options["framerate"] = profile_config["fps"]
        options["video_bitrate"] = profile_config["kbps"][resolution]

    return options


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

        # The default encoding is resolved from the default profile/resolution and
        # applied to every recording that carries no per-recording encoding.
        # When either default is missing, we leave this as None so LiveKit falls
        # back to its built-in preset.
        resolution = settings.RECORDING_ENCODING_DEFAULT_RESOLUTION
        profile = settings.RECORDING_ENCODING_DEFAULT_PROFILE

        encoding_options: Optional[Dict[str, Any]] = None
        if resolution and profile:
            encoding_options = build_encoding_options(resolution, profile)

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
