"""Serializers for the roomkit API of the Meet core app."""

# pylint: disable=abstract-method

from django.conf import settings

from rest_framework import serializers

from core.api.serializers import BaseValidationOnlySerializer


class RoomKitJoinSerializer(BaseValidationOnlySerializer):
    """Validate roomkit join requests from the LiveKit SIP module."""

    pin_code = serializers.CharField(required=True)

    def validate_pin_code(self, value):
        """Ensure the PIN code matches the configured length."""
        if len(value) != settings.ROOM_TELEPHONY_PIN_LENGTH:
            raise serializers.ValidationError("PIN code length is invalid.")
        return value
