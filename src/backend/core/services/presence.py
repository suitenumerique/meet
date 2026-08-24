"""Presence cache.

Redis-backed memo of "this identity is currently connected to this room".

This module is intentionally a *pure cache store* with no dependency on other
services, so that `participants_management` (which talks to LiveKit) can
import it without creating an import cycle. The composition of "check cache,
fall back to LiveKit" lives in
`ParticipantsManagement.check_if_in_meeting_cached`.

Only positive answers are stored: a sticky negative would lock out someone
who joins right after a miss for the whole TTL. The TTL is a safety net in
case an invalidation webhook is lost.
"""

from uuid import UUID

from django.conf import settings
from django.core.cache import cache

from core.utils import CACHE_SCAN_ITERSIZE


class PresenceCache:
    """Store and invalidate (room, identity) presence entries."""

    @staticmethod
    def _get_cache_key(room_id: UUID | str, identity: str) -> str:
        """Cache key for a (room, identity) presence entry."""
        return f"{settings.PRESENCE_KEY_PREFIX}_{room_id!s}_{identity}"

    def is_marked_present(self, room_id: UUID | str, identity: str) -> bool:
        """Return True if a positive presence entry exists in cache."""
        return bool(cache.get(self._get_cache_key(room_id, identity)))

    def mark_present(self, room_id: UUID | str, identity: str) -> None:
        """Record that `identity` is in `room_id`."""
        cache.set(
            self._get_cache_key(room_id, identity),
            True,
            timeout=settings.PRESENCE_CACHE_TIMEOUT,
        )

    def clear(self, room_id: UUID | str, identity: str) -> None:
        """Forget presence for one participant (e.g. on participant_left)."""
        cache.delete(self._get_cache_key(room_id, identity))

    def clear_room(self, room_id: UUID | str) -> None:
        """Forget presence for every participant of a room (on room_finished)."""
        cache.delete_pattern(
            self._get_cache_key(room_id, "*"), itersize=CACHE_SCAN_ITERSIZE
        )
