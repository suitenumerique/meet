"""Permission handlers for the external API of the Meet core app."""

from rest_framework import exceptions, permissions
from rest_framework_api_key.permissions import BaseHasAPIKey

from ..models import ServiceAccountAPIKey, ServiceAccountScope


class HasServiceAccountAPIKey(BaseHasAPIKey):
    """Permission class that requires a valid service account API key.

    Validates that the request includes a valid API key in the Authorization header
    using the format: "Api-Key <key>". The API key must belong to an active
    ServiceAccount and the key itself must not be revoked.

    This permission is typically used for server-to-server authentication
    where external services need to authenticate with our API."""

    model = ServiceAccountAPIKey


class HasRequiredScope(permissions.BasePermission):
    """Enforces scope-based access control on ViewSet actions.

    Provides fine-grained permission management by mapping ViewSet actions
    to required scopes. JWT tokens must contain the appropriate scope to
    perform specific operations, enabling precise control over what external
    services can access (principle of least privilege).
    """

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
        """Check if JWT token contains required scope for this action."""

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
