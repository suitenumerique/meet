"""Abstract base class for entitlements backends."""

from abc import ABC, abstractmethod


class EntitlementsBackend(ABC):
    """Abstract base class that defines the interface for entitlements backends."""

    @abstractmethod
    def get_user_entitlements(
        self, user_sub, user_email, user_info=None, force_refresh=False
    ):
        """Fetch user entitlements.

        Args:
            user_sub: The user's OIDC subject identifier.
            user_email: The user's email address.
            user_info: The full OIDC user_info dict (backends may
                extract claims from it).
            force_refresh: If True, bypass any cache and fetch fresh data.

        Returns:
            dict: {"can_create": bool}

        Raises:
            EntitlementsUnavailableError: If the backend cannot be reached.
        """
