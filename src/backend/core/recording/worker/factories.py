"""Factory, configurations and Protocol to create worker services"""

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, ClassVar, Dict, Optional, Protocol, Type

from django.conf import settings
from django.utils.module_loading import import_string

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WorkerServiceConfig:
    """Declare Worker Service common configurations"""

    output_folder: str
    server_configurations: Dict[str, Any]
    bucket_args: Optional[dict]

    @classmethod
    @lru_cache
    def from_settings(cls) -> "WorkerServiceConfig":
        """Load configuration from Django settings with caching for efficiency."""

        logger.debug("Loading WorkerServiceConfig from settings.")
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
        )


class WorkerService(Protocol):
    """Define the interface for interacting with a worker service."""

    hrid: ClassVar[str]

    def __init__(self, config: WorkerServiceConfig):
        """Initialize the service with the given configuration."""

    def start(self, room_id: str, recording_id: str) -> str:
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
