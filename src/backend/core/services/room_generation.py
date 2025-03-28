"""Wip."""

from django.conf import settings
from django.core.cache import cache


class RoomGeneration:
    """Wip"""

    def _get_cache_key(self, callback_id):
        """Wip"""
        return f"{settings.ROOM_GENERATION_CALLBACK_CACHE_KEY}_{callback_id}"

    def persist_callback_state(self, request, room):
        """Wip."""

        callback_id = request.data.get("callbackId")
        if not callback_id:
            return

        data = {
            "slug": room.slug,
        }
        cache.set(
            self._get_cache_key(callback_id),
            data,
            timeout=settings.ROOM_GENERATION_CALLBACK_CACHE_TIMEOUT,
        )


    def get_callback_state(self, request):
        """Wip."""

        callback_id = request.data.get("callbackId")

        if not callback_id:
            return None

        cache_key = self._get_cache_key(callback_id)

        data = cache.get(cache_key)
        cache.delete(cache_key)

        return data
