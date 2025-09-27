"""Wip."""

# pylint: disable=abstract-method,no-name-in-module

from django.conf import settings
from rest_framework import serializers

import random
import string

from core import models, utils

from core.api.serializers import NestedResourceAccessSerializer, BaseValidationOnlySerializer

class JwtSerializer(BaseValidationOnlySerializer):
    """Validate room creation callback data."""

    email = serializers.EmailField(required=True)

class RoomSerializer(serializers.ModelSerializer):
    """Serialize Room model for the API."""

    class Meta:
        model = models.Room
        fields = ["id", "slug", "configuration", "pin_code", "access_level"]
        read_only_fields = ["id", "name", "slug", "pin_code", "access_level"]

    def to_representation(self, instance):
        """
        Add users only for administrator users.
        Add LiveKit credentials for public instance or related users/groups
        """
        output = super().to_representation(instance)
        request = self.context.get("request")

        if not request:
            return output

        output["url"] = f"{settings.INTEGRATIONS_APP_BASE_URL}/{output["slug"]}"

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

        # todo - extract this in an util function
        def generate_pattern():
            part1 = ''.join(random.choices(string.ascii_lowercase, k=3))
            part2 = ''.join(random.choices(string.ascii_lowercase, k=4))
            part3 = ''.join(random.choices(string.ascii_lowercase, k=3))
            return f"{part1}-{part2}-{part3}"

        validated_data['name'] = generate_pattern()
        validated_data['access_level'] = "trusted"

        return super().create(validated_data)
