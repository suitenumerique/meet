"""Client serializers for the Meet core app."""

# pylint: disable=abstract-method,no-name-in-module

from django.utils.translation import gettext_lazy as _

from livekit.api import ParticipantPermission
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from timezone_field.rest_framework import TimeZoneSerializerField

from core import models, utils


class UserSerializer(serializers.ModelSerializer):
    """Serialize users."""

    timezone = TimeZoneSerializerField()

    class Meta:
        model = models.User
        fields = ["id", "email", "full_name", "short_name", "timezone", "language"]
        read_only_fields = ["id", "email", "full_name", "short_name"]


class ResourceAccessSerializerMixin:
    """
    A serializer mixin to share controlling that the logged-in user submitting a room access object
    is administrator on the targeted room.
    """

    def _is_attempting_unauthorized_owner_assignment(self, user, new_role):
        """Check if user is trying to assign owner role without being an owner."""
        is_assigning_owner_role = new_role == models.RoleChoices.OWNER
        user_lacks_owner_permission = not self.instance.resource.is_owner(user)
        return is_assigning_owner_role and user_lacks_owner_permission

    def _is_attempting_to_remove_another_owner(self, user):
        """Check if user is trying to modify or remove a different owner."""
        target_is_owner = self.instance.role == models.RoleChoices.OWNER
        target_is_different_user = self.instance.user != user
        return target_is_owner and target_is_different_user

    def _violates_update_owner_rules(self, user, data):
        """Check if update operation violates owner assignment rules."""
        new_role = data.get("role")
        return (
            self._is_attempting_unauthorized_owner_assignment(user, new_role)
            or self._is_attempting_to_remove_another_owner(user)
        )

    def _violates_create_owner_rules(self, user, data):
        """Check if create operation violates owner assignment rules."""
        new_role = data.get("role")
        is_assigning_owner_role = new_role == models.RoleChoices.OWNER
        user_lacks_owner_permission = not data["resource"].is_owner(user)
        return is_assigning_owner_role and user_lacks_owner_permission

    def _raise_owner_permission_error(self):
        """Raise permission denied error for unauthorized owner operations."""
        raise PermissionDenied(
            "Only owners of a room can assign other users as owners."
        )

    def validate(self, data):
        """
        Check access rights specific to writing (create/update)
        """
        request = self.context.get("request", None)
        user = getattr(request, "user", None)

        is_update = self.instance is not None

        if is_update and self._violates_update_owner_rules(user, data):
            self._raise_owner_permission_error()

        if not is_update and self._violates_create_owner_rules(user, data):
            self._raise_owner_permission_error()

        return data

    def validate_resource(self, resource):
        """The logged-in user must be administrator of the resource."""
        request = self.context.get("request", None)
        user = getattr(request, "user", None)

        if not (
            user and user.is_authenticated and resource.is_administrator_or_owner(user)
        ):
            raise PermissionDenied(
                _("You must be administrator or owner of a room to add accesses to it.")
            )

        return resource


class ResourceAccessSerializer(
    ResourceAccessSerializerMixin, serializers.ModelSerializer
):
    """Serialize Room to User accesses for the API."""

    class Meta:
        model = models.ResourceAccess
        fields = ["id", "user", "resource", "role"]
        read_only_fields = ["id"]

    def update(self, instance, validated_data):
        """Make "user" and "resource" fields readonly but only on update."""
        validated_data.pop("resource", None)
        validated_data.pop("user", None)
        return super().update(instance, validated_data)


class NestedResourceAccessSerializer(ResourceAccessSerializer):
    """Serialize Room accesses for the API with full nested user."""

    user = UserSerializer(read_only=True)


class ListRoomSerializer(serializers.ModelSerializer):
    """Serialize Room model for a list API endpoint."""

    class Meta:
        model = models.Room
        fields = ["id", "name", "slug", "access_level"]
        read_only_fields = ["id", "slug"]


class RoomSerializer(serializers.ModelSerializer):
    """Serialize Room model for the API."""

    class Meta:
        model = models.Room
        fields = ["id", "name", "slug", "configuration", "access_level", "pin_code"]
        read_only_fields = ["id", "slug", "pin_code"]

    def to_representation(self, instance):
        """
        Add users only for administrator users.
        Add LiveKit credentials for public instance or related users/groups
        """
        output = super().to_representation(instance)
        request = self.context.get("request")

        if not request:
            return output

        role = instance.get_role(request.user)
        is_admin_or_owner = models.RoleChoices.check_administrator_role(
            role
        ) or models.RoleChoices.check_owner_role(role)

        if is_admin_or_owner:
            access_serializer = NestedResourceAccessSerializer(
                instance.accesses.select_related("resource", "user").all(),
                context=self.context,
                many=True,
            )
            output["accesses"] = access_serializer.data

        configuration = output["configuration"]

        if not is_admin_or_owner:
            del output["configuration"]

        should_access_room = (
            (
                instance.access_level == models.RoomAccessLevel.TRUSTED
                and request.user.is_authenticated
            )
            or role is not None
            or instance.is_public
        )

        if should_access_room:
            room_id = f"{instance.id!s}"
            username = request.query_params.get("username", None)
            output["livekit"] = utils.generate_livekit_config(
                room_id=room_id,
                user=request.user,
                username=username,
                configuration=configuration,
                is_admin_or_owner=is_admin_or_owner,
            )

        output["is_administrable"] = is_admin_or_owner

        return output


class RecordingSerializer(serializers.ModelSerializer):
    """Serialize Recording for the API."""

    room = ListRoomSerializer(read_only=True)

    class Meta:
        model = models.Recording
        fields = [
            "id",
            "room",
            "created_at",
            "updated_at",
            "status",
            "mode",
            "key",
            "is_expired",
            "expired_at",
        ]
        read_only_fields = fields


class BaseValidationOnlySerializer(serializers.Serializer):
    """Base serializer for validation-only operations."""

    def create(self, validated_data):
        """Not implemented as this is a validation-only serializer."""
        raise NotImplementedError(f"{self.__class__.__name__} is validation-only")

    def update(self, instance, validated_data):
        """Not implemented as this is a validation-only serializer."""
        raise NotImplementedError(f"{self.__class__.__name__} is validation-only")


class StartRecordingSerializer(BaseValidationOnlySerializer):
    """Validate start recording requests."""

    mode = serializers.ChoiceField(
        choices=models.RecordingModeChoices.choices,
        required=True,
        error_messages={
            "required": "Recording mode is required.",
            "invalid_choice": "Invalid recording mode. Choose between "
            "screen_recording or transcript.",
        },
    )


class RequestEntrySerializer(BaseValidationOnlySerializer):
    """Validate request entry data."""

    username = serializers.CharField(required=True)


class ParticipantEntrySerializer(BaseValidationOnlySerializer):
    """Validate participant entry decision data."""

    participant_id = serializers.UUIDField(required=True)
    allow_entry = serializers.BooleanField(required=True)


class CreationCallbackSerializer(BaseValidationOnlySerializer):
    """Validate room creation callback data."""

    callback_id = serializers.CharField(required=True)


class RoomInviteSerializer(serializers.Serializer):
    """Validate room invite creation data."""

    emails = serializers.ListField(child=serializers.EmailField(), allow_empty=False)


class BaseParticipantsManagementSerializer(BaseValidationOnlySerializer):
    """Base serializer for participant management operations."""

    participant_identity = serializers.UUIDField(
        help_text="LiveKit participant identity (UUID format)"
    )


class MuteParticipantSerializer(BaseParticipantsManagementSerializer):
    """Validate participant muting data."""

    track_sid = serializers.CharField(
        max_length=255, help_text="LiveKit track SID to mute"
    )


class UpdateParticipantSerializer(BaseParticipantsManagementSerializer):
    """Validate participant update data."""

    metadata = serializers.DictField(
        required=False, allow_null=True, help_text="Participant metadata as JSON object"
    )
    attributes = serializers.DictField(
        required=False,
        allow_null=True,
        help_text="Participant attributes as JSON object",
    )
    permission = serializers.DictField(
        required=False,
        allow_null=True,
        help_text="Participant permission as JSON object",
    )
    name = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Display name for the participant",
    )

    def validate(self, attrs):
        """Ensure at least one update field is provided."""
        update_fields = ["metadata", "attributes", "permission", "name"]

        has_update = any(
            field in attrs and attrs[field] is not None and attrs[field] != ""
            for field in update_fields
        )

        if not has_update:
            raise serializers.ValidationError(
                f"At least one of the following fields must be provided: "
                f"{', '.join(update_fields)}."
            )

        if "permission" in attrs:
            try:
                ParticipantPermission(**attrs["permission"])
            except ValueError as e:
                raise serializers.ValidationError(
                    {"permission": f"Invalid permission: {str(e)}"}
                ) from e

        return attrs
