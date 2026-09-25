"""Service handling the lifecycle of transit codes.

A transit code is an opaque, cryptographically random, single-use code
handed to an embedded frontend (through a URL fragment) so it can obtain a
user access token on the core API without a session cookie. The code
carries no information by itself: everything it references (user, client)
is stored server-side in the cache, and consumed atomically on exchange.
"""

import hashlib
import secrets

from django.conf import settings
from django.core.cache import cache


class TransitCodeService:
    """Create and consume single-use transit codes."""

    @staticmethod
    def _cache_key(code):
        """Build the cache key for a code.

        The code is hashed so that a dump of the cache never reveals
        directly usable codes.
        """
        digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
        return f"{settings.TRANSIT_CODE_CACHE_PREFIX}:{digest}"

    def create_code(self, user, client_id="unknown"):
        """Generate a transit code for a user, and store it.

        The code expires after TRANSIT_CODE_TTL seconds.

        Returns:
            str: The opaque code to hand to the client.
        """
        # Default 48 random bytes -> 64 url-safe characters, 384 bits of
        # entropy: unguessable and safe to transit through a URL fragment.
        code = secrets.token_urlsafe(settings.TRANSIT_CODE_NBYTES)

        cache.set(
            self._cache_key(code),
            {
                "user_id": str(user.id),
                "client_id": client_id,
            },
            timeout=settings.TRANSIT_CODE_TTL,
        )

        return code

    def consume_code(self, code):
        """Consume a transit code, enforcing single use.

        The code is deleted from the cache upon consumption. `cache.delete`
        returns whether a key was actually deleted, so if two requests race
        on the same code, only one of them wins.

        Returns:
            dict | None: The data stored at creation time ('user_id',
                'client_id'), or None if the code is unknown, expired or
                already consumed.
        """
        if not code:
            return None

        key = self._cache_key(code)
        data = cache.get(key)

        if data is None or not cache.delete(key):
            return None

        return data
