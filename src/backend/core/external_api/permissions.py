"""Permission handlers for application-delegated API access."""

import logging
from typing import Dict

from rest_framework import exceptions, permissions

from .. import models

logger = logging.getLogger(__name__)


class BaseScopePermission(permissions.BasePermission):
    """Base class for scope-based permission checking.

    Subclasses must define `scope_map` attribute mapping actions to required scopes.
    """

    scope_map: Dict[str, str] = {}

    def has_permission(self, request, view):
        """Check if the JWT token contains the required scope for this action.

        Args:
            request: DRF request object with authenticated user
            view: ViewSet instance

        Returns:
            bool: True if permission granted

        Raises:
            PermissionDenied: If required scope is missing from token
        """
        # Get the current action (e.g., 'list', 'create')
        action = getattr(view, "action", None)
        if not action:
            raise exceptions.PermissionDenied(
                "Insufficient permissions. Unknown action."
            )

        required_scope = self.scope_map.get(action)
        if not required_scope:
            # Action not in scope_map, deny by default
            raise exceptions.PermissionDenied(
                f"Insufficient permissions. Required scope: {required_scope}"
            )

        token_payload = request.auth
        token_scopes = token_payload.get("scope")

        if not token_scopes:
            raise exceptions.PermissionDenied("Insufficient permissions.")

        # Ensure scopes is a list (handle both list and space-separated string)
        if isinstance(token_scopes, str):
            token_scopes = token_scopes.split()

        if required_scope not in token_scopes:
            raise exceptions.PermissionDenied(
                f"Insufficient permissions. Required scope: {required_scope}"
            )

        return True


class HasRequiredRoomScope(BaseScopePermission):
    """Permission class for Room-related operations."""

    scope_map = {
        "list": models.ApplicationScope.ROOMS_LIST,
        "retrieve": models.ApplicationScope.ROOMS_RETRIEVE,
        "create": models.ApplicationScope.ROOMS_CREATE,
        "update": models.ApplicationScope.ROOMS_UPDATE,
        "partial_update": models.ApplicationScope.ROOMS_UPDATE,
        "destroy": models.ApplicationScope.ROOMS_DELETE,
    }
