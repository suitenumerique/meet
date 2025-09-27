"""Wip."""

from logging import getLogger

from django.conf import settings

import jwt
from datetime import datetime, timedelta

from rest_framework import decorators, mixins, pagination, throttling, viewsets
from rest_framework import (
    exceptions as drf_exceptions,
)
from rest_framework import (
    response as drf_response,
)
from rest_framework import (
    status as drf_status,
)

from core import enums, models, utils
from .authentication import IntegrationJWTAuthentication
from . import serializers, permissions

# pylint: disable=too-many-ancestors

logger = getLogger(__name__)


class IntegrationViewSet(viewsets.GenericViewSet):
    """Wip."""

    permission_classes = [permissions.HasServiceAccountAPIKey]

    @decorators.action(
        detail=False,
        methods=["post"],
        url_path="token",
        url_name="token",
    )
    def generate_token(self, request, *args, **kwargs):
        """Generate JWT token for a specific user identified by email."""

        serializer = serializers.JwtSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = models.User.objects.get(email=serializer.validated_data["email"])
        except models.User.DoesNotExist:
            # todo - create unknown user
            raise drf_exceptions.NotFound({"error": "User with this email does not exist."})

        now = datetime.utcnow()
        payload = {
            'user_id': str(user.id),
            'email': user.email,
            'full_name': user.full_name,
            'iat': now,
            'exp': now + timedelta(seconds=settings.INTEGRATIONS_JWT_EXPIRATION_SECONDS),
            'iss': settings.INTEGRATIONS_JWT_ISSUER,
            'aud': 'wip',  # todo - replace with the owner of the api token
            # todo - add scope
        }

        try:
            token = jwt.encode(
                payload,
                settings.INTEGRATIONS_JWT_SECRET_KEY,
                algorithm=settings.INTEGRATIONS_JWT_ALG
            )
        except Exception as e:
            return drf_response.Response(
                {"error": "Failed to generate token"},
                status=drf_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return drf_response.Response(
            {
                "token": token,
                "token_type": settings.INTEGRATIONS_JWT_TOKEN_TYPE,
                "expires_in": settings.INTEGRATIONS_JWT_EXPIRATION_SECONDS,
            },
            status=drf_status.HTTP_200_OK,
        )


class RoomViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Wip."""

    authentication_classes = [IntegrationJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    queryset = models.Room.objects.all()
    serializer_class = serializers.RoomSerializer
