"""Serializers for the external API of the Meet core app."""

# pylint: disable=abstract-method

from django.conf import settings

from rest_framework import serializers

from core import models, utils
from core.api.serializers import BaseValidationOnlySerializer

OAUTH2_GRANT_TYPE_CLIENT_CREDENTIALS = "client_credentials"


class ApplicationJwtSerializer(BaseValidationOnlySerializer):
    """Validate OAuth2 JWT token request data."""

    client_id = serializers.CharField(write_only=True)
    client_secret = serializers.CharField(write_only=True)
    grant_type = serializers.ChoiceField(choices=[OAUTH2_GRANT_TYPE_CLIENT_CREDENTIALS])
    scope = serializers.CharField(write_only=True)


class RoomSerializer(serializers.ModelSerializer):
    """External API serializer for room data exposed to applications.

    Provides limited, safe room information for third-party integrations:
    - Secure defaults for room creation (trusted access level)
    - Computed fields (url, telephony) for external consumption
    - Filtered data appropriate for delegation scenarios
    - Tracks creation source for auditing

    Intentionally exposes minimal information to external applications,
    following the principle of least privilege.
    """

    class Meta:
        model = models.Room
        fields = ["id", "name", "slug", "pin_code", "access_level"]
        read_only_fields = ["id", "name", "slug", "pin_code", "access_level"]

    def to_representation(self, instance):
        """Enrich response with application-specific computed fields."""
        output = super().to_representation(instance)
        request = self.context.get("request")
        pin_code = output.pop("pin_code", None)

        if not request:
            return output

        # Add room URL for direct access
        if settings.APPLICATION_BASE_URL:
            output["url"] = f"{settings.APPLICATION_BASE_URL}/{instance.slug}"

        # Add telephony information if enabled
        if settings.ROOM_TELEPHONY_ENABLED:
            output["telephony"] = {
                "enabled": True,
                "phone_number": settings.ROOM_TELEPHONY_PHONE_NUMBER,
                "pin_code": pin_code,
                "default_country": settings.ROOM_TELEPHONY_DEFAULT_COUNTRY,
            }

        return output

    def create(self, validated_data):
        """Create room with secure defaults for application delegation."""

        # Set secure defaults
        validated_data["name"] = utils.generate_room_slug()
        validated_data["access_level"] = models.RoomAccessLevel.TRUSTED

        return super().create(validated_data)
