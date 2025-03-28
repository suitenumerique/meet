"""Room creation service."""

from django.conf import settings
from django.core.cache import cache


class RoomCreation:
    """Room creation related methods"""

    @staticmethod
    def _get_cache_key(callback_id):
        """Generate a standardized cache key for room creation callbacks."""
        return f"room-creation-callback_{callback_id}"

    def persist_callback_state(self, callback_id: str, room) -> None:
        """Store room data in cache using the callback ID as an identifier."""
        data = {
            "slug": room.slug,
        }
        cache.set(
            self._get_cache_key(callback_id),
            data,
            timeout=settings.ROOM_CREATION_CALLBACK_CACHE_TIMEOUT,
        )

    def get_callback_state(self, callback_id: str) -> dict:
        """Retrieve and clear cached room data for the given callback ID."""

        cache_key = self._get_cache_key(callback_id)
        data = cache.get(cache_key)

        if not data:
            return {}

        cache.delete(cache_key)

        return data
