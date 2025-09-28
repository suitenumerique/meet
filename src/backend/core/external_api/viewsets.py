"""Wip."""

from datetime import datetime, timedelta
from logging import getLogger

from django.conf import settings

import jwt
from rest_framework import decorators, mixins, viewsets
from rest_framework import (
    exceptions as drf_exceptions,
)
from rest_framework import (
    response as drf_response,
)
from rest_framework import (
    status as drf_status,
)

from core import models

from . import permissions, serializers
from .authentication import IntegrationJWTAuthentication

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

        key = request.META["HTTP_AUTHORIZATION"].split()[1]

        api_key = models.ServiceAccountAPIKey.objects.get_from_key(key)
        service_account = api_key.service_account

        email = serializer.validated_data["email"]

        if not service_account.can_impersonate_email(email):
            logger.warning(
                "Service account %s denied impersonation of %s",
                service_account.id,
                email,
            )
            return drf_response.Response(
                {"error": "Access denied"},
                status=drf_status.HTTP_403_FORBIDDEN,
            )

        try:
            user = models.User.objects.get(email=email)
        except models.User.DoesNotExist as e:
            # todo - create unknown user
            raise drf_exceptions.NotFound(
                {"error": "User with this email does not exist."}
            ) from e

        now = datetime.utcnow()
        payload = {
            "user_id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "iat": now,
            "exp": now
            + timedelta(seconds=settings.INTEGRATIONS_JWT_EXPIRATION_SECONDS),
            "iss": settings.INTEGRATIONS_JWT_ISSUER,
            "impersonated": True,
            "client_id": str(service_account.id),  # audience
            "scope": service_account.scopes,
        }

        try:
            token = jwt.encode(
                payload,
                settings.INTEGRATIONS_JWT_SECRET_KEY,
                algorithm=settings.INTEGRATIONS_JWT_ALG,
            )
        except Exception:  # noqa: BLE001
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
    permission_classes = [permissions.IsAuthenticated, permissions.HasRequiredScope]
    queryset = models.Room.objects.all()
    serializer_class = serializers.RoomSerializer

    def list(self, request, *args, **kwargs):
        """Limit listed rooms to the ones related to the authenticated user."""

        user = self.request.user

        if user.is_authenticated:
            queryset = (
                self.filter_queryset(self.get_queryset()).filter(users=user).distinct()
            )
        else:
            queryset = self.get_queryset().none()

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return drf_response.Response(serializer.data)

    def perform_create(self, serializer):
        """Set the current user as owner of the newly created room."""
        room = serializer.save()
        models.ResourceAccess.objects.create(
            resource=room,
            user=self.request.user,
            role=models.RoleChoices.OWNER,
        )
