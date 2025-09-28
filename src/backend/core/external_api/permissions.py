"""Wip."""

from rest_framework import exceptions, permissions
from rest_framework_api_key.permissions import BaseHasAPIKey

from ..models import ServiceAccountAPIKey, ServiceAccountScope


class HasServiceAccountAPIKey(BaseHasAPIKey):
    """Wip."""

    model = ServiceAccountAPIKey


class IsAuthenticated(permissions.BasePermission):
    """
    Allows access only to authenticated users. Alternative method checking the presence
    of the auth token to avoid hitting the database.
    """

    def has_permission(self, request, view):
        return bool(request.auth) or request.user.is_authenticated


class HasRequiredScope(permissions.BasePermission):
    """Check if JWT token has required scope for the action."""

    # Map ViewSet actions to required scopes
    scope_map = {
        "list": ServiceAccountScope.ROOMS_LIST,
        "retrieve": ServiceAccountScope.ROOMS_RETRIEVE,
        "create": ServiceAccountScope.ROOMS_CREATE,
        "update": ServiceAccountScope.ROOMS_UPDATE,
        "partial_update": ServiceAccountScope.ROOMS_UPDATE,
        "destroy": ServiceAccountScope.ROOMS_DELETE,
    }

    def has_permission(self, request, view):
        """Wip."""

        action = getattr(view, "action", None)
        if not action:
            return True

        required_scope = self.scope_map.get(action)
        if not required_scope:
            return True

        token_scopes = getattr(request.user, "token_scopes", [])

        if required_scope not in token_scopes:
            raise exceptions.PermissionDenied("Insufficient permissions")

        return True
