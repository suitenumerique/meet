"""Client serializers for the external API of the Meet core app."""

# pylint: disable=abstract-method

from django.conf import settings

from rest_framework import serializers

from core import models, utils
from core.api.serializers import BaseValidationOnlySerializer


class JwtSerializer(BaseValidationOnlySerializer):
    """Validate OAuth2 JWT token request data."""

    client_id = serializers.UUIDField()
    client_secret = serializers.CharField(write_only=True)
    grant_type = serializers.ChoiceField(choices=["client_credentials"])
    scope = serializers.EmailField()


class RoomSerializer(serializers.ModelSerializer):
    """External API serializer with limited, safe room information.

    Designed for external integrations with:
    - Read-only access to most fields for security
    - Additional computed fields (url, telephony info)
    - Filtered data appropriate for external consumption
    - Automatic room creation with secure defaults

    Intentionally limits exposed information compared to internal APIs,
    providing only what external services need while protecting sensitive details.
    """

    class Meta:
        model = models.Room
        fields = ["id", "name", "slug", "pin_code", "access_level"]
        read_only_fields = ["id", "name", "slug", "pin_code", "access_level"]

    def to_representation(self, instance):
        """Add external-specific fields and filter sensitive data."""
        output = super().to_representation(instance)
        request = self.context.get("request")

        if not request:
            return output

        output["url"] = f"{settings.INTEGRATIONS_APP_BASE_URL}/{output['slug']}"

        if settings.ROOM_TELEPHONY_ENABLED:
            output["telephony"] = {
                "enabled": settings.ROOM_TELEPHONY_ENABLED,
                "pin_code": output["pin_code"],
                "phone_number": settings.ROOM_TELEPHONY_PHONE_NUMBER,
                "default_country": settings.ROOM_TELEPHONY_DEFAULT_COUNTRY,
            }
        del output["pin_code"]
        del output["name"]

        return output

    def create(self, validated_data):
        """Create room with secure defaults for external API."""
        # todo - track source of creation
        validated_data["name"] = utils.generate_slug()
        validated_data["access_level"] = models.RoomAccessLevel.TRUSTED

        return super().create(validated_data)
