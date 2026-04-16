"""Client serializers for the Meet core app."""

# pylint: disable=abstract-method,no-name-in-module
import logging
from os.path import splitext
from typing import Literal
from urllib.parse import quote

from django.conf import settings
from django.core.exceptions import SuspiciousOperation

# pylint: disable=abstract-method,no-name-in-module
from django.utils.translation import gettext_lazy as _

from django_pydantic_field.rest_framework import SchemaField
from pydantic import BaseModel, Field
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from timezone_field.rest_framework import TimeZoneSerializerField

from core import models, utils

logger = logging.getLogger(__name__)


class UserSerializer(serializers.ModelSerializer):
    """Serialize users."""

    timezone = TimeZoneSerializerField()

    class Meta:
        model = models.User
        fields = ["id", "email", "full_name", "short_name", "timezone", "language"]
        read_only_fields = ["id", "email", "full_name", "short_name"]


class UserLightSerializer(serializers.ModelSerializer):
    """Serialize users with limited fields."""

    class Meta:
        model = models.User
        fields = ["id", "full_name", "short_name"]
        read_only_fields = ["id", "full_name", "short_name"]


class ResourceAccessSerializerMixin:
    """
    A serializer mixin to share controlling that the logged-in user submitting a room access object
    is administrator on the targeted room.
    """

    # pylint: disable=too-many-boolean-expressions
    def validate(self, data):
        """
        Check access rights specific to writing (create/update)
        """
        request = self.context.get("request", None)
        user = getattr(request, "user", None)
        if (
            # Update
            self.instance
            and (
                data.get("role") == models.RoleChoices.OWNER
                and not self.instance.resource.is_owner(user)
                or self.instance.role == models.RoleChoices.OWNER
                and self.instance.user != user
            )
        ) or (
            # Create
            not self.instance
            and data.get("role") == models.RoleChoices.OWNER
            and not data["resource"].is_owner(user)
        ):
            raise PermissionDenied(
                "Only owners of a room can assign other users as owners."
            )
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
        else:
            del output["pin_code"]

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
            "options",
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


class RecordingOptions(BaseModel):
    """Configuration options for recording.

    Attributes:
        language: ISO 639-1 language code compatible with whisperX.
            When `None`, the transcription engine will attempt to
            auto-detect the spoken language.
        transcribe: Whether to transcribe the recorded audio.
            When `None`, falls back to the application default.
        original_mode: The original recording mode before any override.
            Must be one of the valid RecordingModeChoices values when provided.
        collect_metadata: Whether to collect additional metadata during recording.
            When `None`, no metadata are collected.

    """

    language: str | None = None
    transcribe: bool | None = None
    collect_metadata: bool | None = None
    original_mode: Literal["screen_recording", "transcript"] | None = None

    model_config = {"extra": "forbid"}


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
    options = SchemaField(
        schema=RecordingOptions | None,
        required=False,
        allow_null=True,
        help_text="Recording options",
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


TrackSource = Literal["SCREEN_SHARE", "SCREEN_SHARE_AUDIO", "CAMERA", "MICROPHONE"]


class ParticipantPermission(BaseModel):
    """Mirror the LiveKit ParticipantPermission protobuf.

    Control what a participant is allowed to publish, subscribe, and do within a room.
    Unknown fields are rejected.
    """

    can_subscribe: bool | None = None
    can_publish: bool | None = None
    can_publish_data: bool | None = None
    can_publish_sources: list[TrackSource] = Field(default_factory=list)
    hidden: bool | None = None
    recorder: bool | None = None
    can_update_metadata: bool | None = None
    agent: bool | None = None
    can_subscribe_metrics: bool | None = None

    model_config = {"extra": "forbid"}


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
    permission = SchemaField(
        schema=ParticipantPermission | None,
        required=False,
        allow_null=True,
        help_text="Participant permissions",
    )
    name = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Display name for the participant",
    )

    def validate_permission(self, permission):
        """Validate that the given permission does not include forbidden or unimplemented fields."""

        if permission is None:
            return None

        suspicious_fields = [
            field
            for field in settings.PARTICIPANT_FORBIDDEN_PERMISSION_FIELDS
            if getattr(permission, field) is not None
        ]
        if suspicious_fields:
            raise SuspiciousOperation(
                f"Setting the following participant permissions is not allowed: "
                f"{', '.join(suspicious_fields)}."
            )

        return permission

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

        return attrs


class ListFileSerializer(serializers.ModelSerializer):
    """Serialize File model for the API."""

    url = serializers.SerializerMethodField(read_only=True)
    creator = UserLightSerializer(read_only=True)
    abilities = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.File
        fields = [
            "id",
            "created_at",
            "updated_at",
            "title",
            "type",
            "creator",
            "deleted_at",
            "hard_deleted_at",
            "filename",
            "upload_state",
            "mimetype",
            "size",
            "description",
            "url",
            "abilities",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "creator",
            "deleted_at",
            "hard_deleted_at",
            "filename",
            "upload_state",
            "mimetype",
            "size",
            "url",
            "abilities",
        ]

    def get_url(self, obj):
        """Return the URL of the file."""
        if obj.is_pending_upload:
            return None

        return f"{settings.MEDIA_BASE_URL}{settings.MEDIA_URL}{quote(obj.file_key)}"

    def get_abilities(self, file) -> dict:
        """Return abilities of the logged-in user on the instance."""
        request = self.context.get("request")
        if not request:
            return {}

        return file.get_abilities(request.user)


class FileSerializer(ListFileSerializer):
    """Default serializer File model for the API."""

    def create(self, validated_data):
        raise NotImplementedError("Create method can not be used.")


class CreateFileSerializer(ListFileSerializer):
    """Serializer used to create a new file"""

    title = serializers.CharField(max_length=255, required=False)
    policy = serializers.SerializerMethodField()

    class Meta:
        model = models.File
        fields = [*ListFileSerializer.Meta.fields, "policy"]
        read_only_fields = [
            *(
                field
                for field in ListFileSerializer.Meta.read_only_fields
                if field != "filename"
            ),
            "policy",
        ]

    def get_fields(self):
        """Force the id field to be writable."""
        fields = super().get_fields()
        fields["id"].read_only = False

        return fields

    def validate_id(self, value):
        """Ensure the provided ID does not already exist when creating a new file."""
        request = self.context.get("request")

        # Only check this on POST (creation)
        if request and models.File.objects.filter(id=value).exists():
            raise serializers.ValidationError(
                "A file with this ID already exists. You cannot override it.",
                code="file_create_existing_id",
            )

        return value

    def validate(self, attrs):
        """Validate extension and fill title."""
        # we run the default validation first to make sure the base data in attrs is ok
        attrs = super().validate(attrs)

        filename_root, ext = splitext(attrs["filename"])

        if settings.FILE_UPLOAD_APPLY_RESTRICTIONS:
            config_for_file_type = settings.FILE_UPLOAD_RESTRICTIONS[attrs["type"]]
            if ext.lower() not in config_for_file_type["allowed_extensions"]:
                logger.info(
                    "create_item: file extension not allowed %s for filename %s",
                    ext,
                    attrs["filename"],
                )
                raise serializers.ValidationError(
                    {"filename": _("This file extension is not allowed.")},
                    code="item_create_file_extension_not_allowed",
                )

        # The title will be the filename if not provided
        if not attrs.get("title", None):
            attrs["title"] = filename_root

        return attrs

    def get_policy(self, file):
        """Return the policy to use if the item is a file."""

        if file.upload_state == models.FileUploadStateChoices.READY:
            return None

        return utils.generate_upload_policy(file)

    def update(self, instance, validated_data):
        raise NotImplementedError("Update method can not be used.")


class RaiseHandSerializer(BaseValidationOnlySerializer):
    """Serializer for raising or lowering a participant's hand in a room."""

    raised = serializers.BooleanField()


class RenameParticipantSerializer(BaseValidationOnlySerializer):
    """Serializer for renaming a participant in a room."""

    name = serializers.CharField(min_length=1, max_length=255, allow_blank=False)
