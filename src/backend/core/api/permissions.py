"""Permission handlers for the Meet core app."""

from rest_framework import permissions

from ..models import RoleChoices

ACTION_FOR_METHOD_TO_PERMISSION = {
    "versions_detail": {"DELETE": "versions_destroy", "GET": "versions_retrieve"}
}


class IsAuthenticated(permissions.BasePermission):
    """
    Allows access only to authenticated users. Alternative method checking the presence
    of the auth token to avoid hitting the database.
    """

    def has_permission(self, request, view):
        return bool(request.auth) or request.user.is_authenticated


class IsAuthenticatedOrSafe(IsAuthenticated):
    """Allows access to authenticated users (or anonymous users but only on safe methods)."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return super().has_permission(request, view)


class IsSelf(IsAuthenticated):
    """
    Allows access only to authenticated users. Alternative method checking the presence
    of the auth token to avoid hitting the database.
    """

    def has_object_permission(self, request, view, obj):
        """Write permissions are only allowed to the user itself."""
        return obj == request.user


class RoomPermissions(permissions.BasePermission):
    """
    Permissions applying to the room API endpoint.
    """

    def has_permission(self, request, view):
        """Only allow authenticated users for unsafe methods."""
        if request.method in permissions.SAFE_METHODS:
            return True

        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        """Object permissions are only given to administrators of the room."""

        if request.method in permissions.SAFE_METHODS:
            return True

        user = request.user

        if request.method == "DELETE":
            return obj.is_owner(user)

        return obj.is_administrator_or_owner(user)


class ResourceAccessPermission(IsAuthenticated):
    """
    Permissions for a room that can only be updated by room administrators.
    """

    def has_object_permission(self, request, view, obj):
        """
        Check that the logged-in user is administrator of the linked room.
        """
        user = request.user
        if request.method == "DELETE" and obj.role == RoleChoices.OWNER:
            return obj.user == user

        return obj.resource.is_administrator_or_owner(user)


class HasAbilityPermission(IsAuthenticated):
    """Permission class for access objects."""

    def has_object_permission(self, request, view, obj):
        """Check permission for a given object."""
        return obj.get_abilities(request.user).get(view.action, False)


class HasPrivilegesOnRoom(IsAuthenticated):
    """Check if user has privileges on a given room."""

    message = "You must have privileges on room to perform this action."

    def has_object_permission(self, request, view, obj):
        """Determine if user has privileges on room."""
        return obj.is_administrator_or_owner(request.user)


class HasLiveKitRoomAccess(permissions.BasePermission):
    """Check if authenticated user's LiveKit token is for the specific room."""

    def has_object_permission(self, request, view, obj):
        if not request.auth or not hasattr(request.auth, "video"):
            return False
        return request.auth.video.room == str(obj.id)
