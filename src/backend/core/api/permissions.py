"""Permission handlers for the Meet core app."""

from django.conf import settings
from django.http import Http404

from rest_framework import permissions

from ..models import RoleChoices
from ..services.participants_management import (
    ParticipantNotFoundException,
    ParticipantsManagement,
    ParticipantsManagementException,
)

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


class FilePermission(IsAuthenticated):
    """
    Permissions applying to the file API endpoint.
    Handling soft deletions specificities
    """

    def has_permission(self, request, view):
        """Allow access only to authenticated users."""
        if not settings.FILE_UPLOAD_ENABLED:
            raise Http404

        return super().has_permission(request, view)

    def has_object_permission(self, request, view, obj):
        """
        Return a 404 on deleted files or if the user is not the owner
        """

        if obj.deleted_at is not None or obj.hard_deleted_at is not None:
            raise Http404

        if obj.creator != request.user:
            raise Http404

        return obj.get_abilities(request.user).get(view.action, False)


class CanMuteParticipant(permissions.BasePermission):
    """
    Grant muting rights based on role or room configuration.

    - Admins and owners can always mute.
    - When `everyone_can_mute` is enabled on the room, any participant
      currently in the room (proven by a valid LiveKit token for that room)
      can mute.
    """

    def has_object_permission(self, request, view, obj):
        """Check if the requesting user is allowed to mute a participant in the given room."""

        is_livekit_token_auth = request.auth and hasattr(request.auth, "video")

        # Always allow admins/owners when authenticated with session cookie
        if not is_livekit_token_auth and obj.is_administrator_or_owner(request.user):
            return True

        everyone_can_mute = obj.configuration.get("everyone_can_mute", True)
        if not everyone_can_mute:
            return False

        if not is_livekit_token_auth:
            return False

        # LiveKit token scoped to this room
        return request.auth.video.room == str(obj.id)


class IsPresentInMeeting(permissions.BasePermission):
    """Check that the requesting user is currently connected to the meeting.

    The requester must be session-authenticated (their DB identity is needed
    to check privileges); presence is verified against LiveKit using their
    `sub` as participant identity. Fails closed on LiveKit errors.
    """

    message = "You must be connected to the meeting to perform this action."

    def has_object_permission(self, request, view, obj):
        """Verify the requester's identity is a participant of the room."""
        user = request.user

        if not user or not user.is_authenticated:
            return False

        try:
            return ParticipantsManagement().check_if_in_meeting(
                room_name=str(obj.pk), identity=str(user.sub)
            )
        except ParticipantNotFoundException:
            return False
        except ParticipantsManagementException:
            return False
