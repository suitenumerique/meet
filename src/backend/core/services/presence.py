"""Presence cache."""

from typing import List
from uuid import UUID

from django.conf import settings
from django.core.cache import cache


class PresenceCache:
    """Store and invalidate (room, identity) presence entries."""

    @staticmethod
    def _get_cache_key(room_id: UUID | str, identity: str) -> str:
        """Cache key for a (room, identity) presence entry."""
        return f"{settings.PRESENCE_KEY_PREFIX}_{room_id!s}_{identity}"

    @staticmethod
    def _get_index_key(room_id: UUID | str) -> str:
        """Raw Redis key of the per-room identity index (a native SET).

        Built through django-redis' make_key so it lives under the same
        KEY_PREFIX/version namespace as the presence entries.
        """
        return cache.client.make_key(
            f"{settings.PRESENCE_KEY_PREFIX}-index_{room_id!s}"
        )

    @staticmethod
    def _redis(write: bool = True):
        """Raw redis-py client.

        SADD/SREM/SMEMBERS are not exposed by the Django cache API; this is
        the documented django-redis escape hatch.
        """
        return cache.client.get_client(write=write)

    def _index_members(self, room_id: UUID | str) -> List[str]:
        """All identities currently indexed for the room."""
        members = self._redis(write=False).smembers(self._get_index_key(room_id))
        return [
            member.decode() if isinstance(member, bytes) else member
            for member in members
        ]

    def is_marked_present(self, room_id: UUID | str, identity: str) -> bool:
        """Return True if a positive presence entry exists in cache."""
        return bool(cache.get(self._get_cache_key(room_id, identity)))

    def mark_present(self, room_id: UUID | str, identity: str) -> None:
        """Record that `identity` is in `room_id` and index it for the room."""
        cache.set(
            self._get_cache_key(room_id, identity),
            True,
            timeout=settings.PRESENCE_CACHE_TIMEOUT,
        )
        index_key = self._get_index_key(room_id)
        pipe = self._redis().pipeline(transaction=False)
        pipe.sadd(index_key, identity)
        pipe.expire(index_key, settings.PRESENCE_CACHE_TIMEOUT)
        pipe.execute()

    def clear(self, room_id: UUID | str, identity: str) -> None:
        """Forget presence for one participant (e.g. on participant_left)."""
        cache.delete(self._get_cache_key(room_id, identity))
        self._redis().srem(self._get_index_key(room_id), identity)

    def clear_room(self, room_id: UUID | str) -> None:
        """Forget presence for every participant of a room (on room_finished).

        Deletes the indexed entries and the index itself with targeted
        commands instead of a full-keyspace pattern scan.
        """
        identities = self._index_members(room_id)
        if identities:
            cache.delete_many(
                [self._get_cache_key(room_id, identity) for identity in identities]
            )
        self._redis().delete(self._get_index_key(room_id))
