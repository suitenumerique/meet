"""Permission handlers for the Meet core app."""

from django.conf import settings

from rest_framework import permissions

from ..models import Recording, RecordingStatusChoices, RoleChoices

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


class HasRecordingPermission(IsAuthenticated):
    """Check if user has permission to start/stop recording based on mode and settings."""

    message = "You do not have permission to perform this recording action."

    def _get_permission_level(self, mode):
        """Return the permission level for the given mode."""
        if mode == "screen_recording":
            return getattr(settings, "RECORDING_SCREEN_PERMISSION", "admin_owner")
        if mode == "transcript":
            return getattr(settings, "RECORDING_TRANSCRIPT_PERMISSION", "admin_owner")
        return "admin_owner"

    def has_object_permission(self, request, view, obj):
        """Check object-level permissions based on recording mode."""
        mode = request.data.get("mode")

        # For stop-recording, get mode from active recording
        if not mode:
            try:
                recording = Recording.objects.get(
                    room=obj, status=RecordingStatusChoices.ACTIVE
                )
                mode = recording.mode
            except Recording.DoesNotExist:
                # No active recording, let the view handle the error
                return True

        permission_level = self._get_permission_level(mode)

        if permission_level == "authenticated":
            # Already authenticated via IsAuthenticated.has_permission
            return True
        # admin_owner
        return obj.is_administrator_or_owner(request.user)


class HasLiveKitRoomAccess(permissions.BasePermission):
    """Check if authenticated user's LiveKit token is for the specific room."""

    def has_object_permission(self, request, view, obj):
        if not request.auth or not hasattr(request.auth, "video"):
            return False
        return request.auth.video.room == str(obj.id)
