"""Wip."""

# pylint: disable=abstract-method,no-name-in-module

from django.conf import settings

from rest_framework import serializers

from core import models, utils
from core.api.serializers import BaseValidationOnlySerializer


class JwtSerializer(BaseValidationOnlySerializer):
    """Validate room creation callback data."""

    email = serializers.EmailField(required=True)


class RoomSerializer(serializers.ModelSerializer):
    """Serialize Room model for the API."""

    class Meta:
        model = models.Room
        fields = ["id", "name", "slug", "configuration", "pin_code", "access_level"]
        read_only_fields = ["id", "name", "slug", "pin_code", "access_level"]

    def to_representation(self, instance):
        """Wip."""
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

        return output

    def create(self, validated_data):
        """Custom create method."""

        # todo - track source of creation

        validated_data["name"] = utils.generate_slug()
        validated_data["access_level"] = models.RoomAccessLevel.TRUSTED

        return super().create(validated_data)
