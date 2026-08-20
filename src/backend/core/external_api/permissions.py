"""Permission handlers for application-delegated API access."""

import logging
from typing import Dict

from django.conf import settings

from rest_framework import exceptions, permissions

from .. import models

logger = logging.getLogger(__name__)


class BaseScopePermission(permissions.BasePermission):
    """Base class for scope-based permission checking.

    Subclasses must define `scope_map` attribute mapping actions to required scopes.
    """

    scope_map: Dict[str, str] = {}

    def get_required_scope(self, view):
        """Return the scope required by the view's current action.

        Returns:
            The required scope, or None for an unsupported method so
            DRF's router can answer 405.

        Raises:
            PermissionDenied: If the action is not in scope_map (deny by
                default).
        """
        # Get the current action (e.g., 'list', 'create'), if None let DRF handle it
        action = getattr(view, "action", None)
        if not action:
            # DRF routers return a 405 for unsupported methods
            return None

        required_scope = self.scope_map.get(action)
        if not required_scope:
            # Action not in scope_map, deny by default
            raise exceptions.PermissionDenied(
                f"Insufficient permissions. Required scope: {required_scope}"
            )

        return required_scope

    def get_token_scopes(self, request):
        """Extract and normalize the scopes claimed by the token."""
        token_scopes = (request.auth or {}).get("scope")

        if not token_scopes:
            return []

        # Ensure scopes is a list (handle both list and space-separated string)
        if isinstance(token_scopes, str):
            token_scopes = token_scopes.split()

        # Ensure scopes is a deduplicated list (preserving order) and lowercase all scopes
        token_scopes = list(dict.fromkeys(scope.lower() for scope in token_scopes))

        return self.strip_scope_prefix(token_scopes)

    @staticmethod
    def strip_scope_prefix(token_scopes):
        """Strip the OIDC resource server prefix, when configured."""
        if settings.OIDC_RS_SCOPES_PREFIX:
            return [
                scope.removeprefix(f"{settings.OIDC_RS_SCOPES_PREFIX}:")
                for scope in token_scopes
            ]
        return token_scopes

    def has_permission(self, request, view):
        """Check if the token claims the scope required by this action.

        Args:
            request: DRF request object with authenticated user
            view: ViewSet instance

        Returns:
            bool: True if permission granted

        Raises:
            PermissionDenied: If required scope is missing from token
        """
        required_scope = self.get_required_scope(view)
        if required_scope is None:
            return True

        token_scopes = self.get_token_scopes(request)

        if not token_scopes:
            raise exceptions.PermissionDenied("Insufficient permissions.")

        if required_scope not in token_scopes:
            raise exceptions.PermissionDenied(
                f"Insufficient permissions. Required scope: {required_scope}"
            )

        return True


class ApplicationScopePermission(BaseScopePermission):
    """Scope-based permission for application-authenticated endpoints."""

    @staticmethod
    def strip_scope_prefix(token_scopes):
        """Compare application scopes verbatim."""
        return token_scopes

    def has_permission(self, request, view):
        """Check the scope claim, then the grant recorded in the database."""
        granted = super().has_permission(request, view)

        required_scope = self.get_required_scope(view)

        if granted and required_scope:
            client_id = (request.auth or {}).get("client_id")

            if not models.Application.has_active_scope(client_id, required_scope):
                logger.warning(
                    "Application '%s' presented scope '%s' without a matching "
                    "grant in database",
                    client_id,
                    required_scope,
                )
                raise exceptions.PermissionDenied(
                    f"Application is not granted the required scope: {required_scope}"
                )

        return granted


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


class HasRequiredUserScope(ApplicationScopePermission):
    """Scope-based permissions for the external user endpoints."""

    scope_map = {
        "generate_transit_code": models.ApplicationScope.USERS_SESSION,
    }


class RoomPermissions(permissions.BasePermission):
    """Permissions applying to the room API endpoint."""

    def has_permission(self, request, view):
        """Allow access only to authenticated users."""
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        """Enforce role-based access: read=any role, delete=owner, write=admin or owner."""
        user = request.user

        if request.method in permissions.SAFE_METHODS:
            return obj.has_any_role(user)

        if request.method == "DELETE":
            return obj.is_owner(user)

        return obj.is_administrator_or_owner(user)
