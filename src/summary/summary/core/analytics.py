"""Analytics classes."""

import json
import time
from collections import Counter
from functools import lru_cache

import redis
from celery.utils.log import get_task_logger
from posthog import Posthog

from summary.core.config import get_settings

logger = get_task_logger(__name__)
settings = get_settings()


class AnalyticsException(Exception):
    """Exception raised when analytics operations fail."""

    pass


class Analytics:
    """Analytics client wrapper for PostHog integration."""

    def __init__(self):
        """Initialize a client if settings are configure."""
        self._client = None
        if settings.posthog_api_key and settings.posthog_enabled:
            logger.info("Initialize analytics client")
            self._client = Posthog(settings.posthog_api_key, settings.posthog_api_host)

    @property
    def is_disabled(self):
        """Check if analytics client is disabled or not configured."""
        return not self._client

    def capture(self, event_name, distinct_id, properties=None):
        """Track an event if analytics is enabled."""
        if self.is_disabled:
            return

        try:
            self._client.capture(
                event_name, distinct_id=distinct_id, properties=properties
            )
        except Exception as e:
            raise AnalyticsException("Failed to capture analytics event") from e

    def is_feature_enabled(
        self, feature_name: str, distinct_id: str = None
    ) -> bool:
        """
        Check if a feature flag is enabled in PostHog for a dinstinct_id.
        """
        if self.is_disabled:
            return False

        try:
            logger.info(
                f"Check feature flag {feature_name} for user {distinct_id}"
            )
            return self._client.feature_enabled(feature_name, distinct_id)
        except Exception as e:
            logger.error(f"Error checking feature flag {feature_name}: {e}")
            return False


@lru_cache
def get_analytics():
    """Init Analytics client once."""
    return Analytics()


class MetadataManager:
    """A Redis-based metadata manager for storing and retrieving task metadata."""

    def __init__(self):
        """Initialize the task tracker with analytics client."""
        self._redis = redis.from_url(settings.task_tracker_redis_url)
        self._key_prefix = settings.task_tracker_prefix
        self._analytics = get_analytics()
        self._is_disabled = self._analytics.is_disabled

    def _get_redis_key(self, task_id):
        """Generate Redis key for task metadata."""
        return f"{self._key_prefix}{task_id}"

    def _save_metadata(self, task_id, metadata):
        """Save metadata for a specific task to Redis."""
        self._redis.hset(self._get_redis_key(task_id), mapping=metadata)

    @staticmethod
    def _convert_value(value):
        """Convert a string value to the most appropriate Python type."""
        try:
            return int(value)
        except ValueError:
            try:
                return float(value)
            except ValueError:
                return value

    def _get_metadata(self, task_id):
        """Retrieve and parse metadata for a specific task from Redis."""
        raw_metadata = self._redis.hgetall(self._get_redis_key(task_id))
        return {
            k.decode("utf-8"): self._convert_value(v.decode("utf-8"))
            for k, v in raw_metadata.items()
        }

    def has_task_id(self, task_id):
        """Check if task_id exists in tasks metadata cache."""
        return self._redis.exists(self._get_redis_key(task_id))

    def create(self, task_id, task_args):
        """Create initial metadata entry for a new task."""
        if self._is_disabled or self.has_task_id(task_id):
            return

        initial_metadata = {
            "start_time": time.time(),
            "asr_model": settings.openai_asr_model,
            "retries": 0,
        }

        _required_args_count = 7
        if len(task_args) != _required_args_count:
            logger.error("Invalid number of arguments.")
            return

        filename, email, _, received_at, *_ = task_args

        initial_metadata = {
            **initial_metadata,
            "filename": filename,
            "email": email,
            "queuing_time": round(initial_metadata["start_time"] - received_at, 2),
        }

        self._save_metadata(task_id, initial_metadata)

    def retry(self, task_id):
        """Increment retry counter for a task."""
        if self._is_disabled or not self.has_task_id(task_id):
            return

        metadata = self._get_metadata(task_id)

        if "retries" in metadata:
            metadata["retries"] = int(metadata["retries"]) + 1
        else:
            metadata["retries"] = 1

        self._save_metadata(task_id, metadata)

    def clear(self, task_id):
        """Remove task metadata from cache."""
        if self._is_disabled or not self.has_task_id(task_id):
            return
        self._redis.delete(self._get_redis_key(task_id))

    def track(self, task_id, data):
        """Update task metadata with additional data."""
        if self._is_disabled or not self.has_task_id(task_id):
            return

        metadata = self._get_metadata(task_id)
        self._save_metadata(task_id, {**metadata, **data})

    def track_transcription_metadata(self, task_id, transcription):
        """Extract and track metadata from transcription results."""
        if self._is_disabled or not self.has_task_id(task_id):
            return

        if not transcription or not transcription.segments:
            self.track(task_id, {"transcription_empty": "true", "number_speakers": 0})
            return

        speakers = [
            segment.get("speaker", "UNKNOWN_SPEAKER")
            for segment in transcription.segments
        ]

        speaker_counts = Counter(speakers)
        segments_count = len(transcription.segments)

        speaker_percentages = {
            speaker: round((count / segments_count) * 100, 2)
            for speaker, count in speaker_counts.items()
        }

        text_length = 0

        for segment in transcription.segments:
            text_length += len(segment.get("text", ""))

        self.track(
            task_id,
            {
                "transcription_empty": "false",
                "speakers_count": len(set(speakers)),
                "segments_count": segments_count,
                "speakers_distribution": json.dumps(speaker_percentages),
                "text_length": text_length,
            },
        )

    def capture(self, task_id, event_name):
        """Capture analytics event with task metadata and clean up."""
        if self._is_disabled or not self.has_task_id(task_id):
            return

        metadata = self._get_metadata(task_id)

        if "start_time" in metadata:
            metadata["execution_time"] = round(time.time() - metadata["start_time"], 2)
            del metadata["start_time"]

        metadata["task_id"] = task_id

        self.clear(task_id)

        try:
            self._analytics.capture(event_name, metadata.get("email"), metadata)
        except AnalyticsException:
            logger.exception("Failed to capture analytics event")
