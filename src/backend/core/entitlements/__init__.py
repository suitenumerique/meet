"""Entitlements service layer."""

from core.entitlements.factory import get_entitlements_backend


class EntitlementsUnavailableError(Exception):
    """Raised when the entitlements backend cannot be reached or returns an error."""


def get_user_entitlements(user_sub, user_email, user_info=None, force_refresh=False):
    """Get user entitlements, delegating to the configured backend.

    Args:
        user_sub: The user's OIDC subject identifier.
        user_email: The user's email address.
        user_info: The full OIDC user_info dict (forwarded to backend).
        force_refresh: If True, bypass backend cache and fetch fresh data.

    Returns:
        dict: {"can_create": bool}

    Raises:
        EntitlementsUnavailableError: If the backend cannot be reached
            and no cache exists.
    """
    backend = get_entitlements_backend()
    return backend.get_user_entitlements(
        user_sub, user_email, user_info=user_info, force_refresh=force_refresh
    )
