"""Serializers for the external API of the Meet core app."""

# pylint: disable=abstract-method

from rest_framework import serializers

from core.api.serializers import BaseValidationOnlySerializer

OAUTH2_GRANT_TYPE_CLIENT_CREDENTIALS = "client_credentials"


class ApplicationJwtSerializer(BaseValidationOnlySerializer):
    """Validate OAuth2 JWT token request data."""

    client_id = serializers.CharField(write_only=True)
    client_secret = serializers.CharField(write_only=True)
    grant_type = serializers.ChoiceField(choices=[OAUTH2_GRANT_TYPE_CLIENT_CREDENTIALS])
    scope = serializers.CharField(write_only=True)
