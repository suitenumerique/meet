"""Permission handlers for the external API of the Meet core app."""

from rest_framework import exceptions, permissions

from .. import models


class HasRequiredScope(permissions.BasePermission):
    """Enforces scope-based access control on ViewSet actions.

    Provides fine-grained permission management by mapping ViewSet actions
    to required scopes. JWT tokens must contain the appropriate scope to
    perform specific operations, enabling precise control over what external
    services can access (principle of least privilege).
    """

    scope_map = {
        "list": models.ServiceAccountScope.ROOMS_LIST,
        "retrieve": models.ServiceAccountScope.ROOMS_RETRIEVE,
        "create": models.ServiceAccountScope.ROOMS_CREATE,
        "update": models.ServiceAccountScope.ROOMS_UPDATE,
        "partial_update": models.ServiceAccountScope.ROOMS_UPDATE,
        "destroy": models.ServiceAccountScope.ROOMS_DELETE,
    }

    def has_permission(self, request, view):
        """Check if JWT token contains required scope for this action."""

        action = getattr(view, "action", None)
        if not action:
            return True

        required_scope = self.scope_map.get(action)
        if not required_scope:
            return True

        token_scopes = getattr(request.user, "token_scopes", [])

        # todo - parse properly scope

        if required_scope not in token_scopes:
            raise exceptions.PermissionDenied("Insufficient permissions")

        return True
