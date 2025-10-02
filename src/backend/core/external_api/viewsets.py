"""External API endpoints"""

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

from core import api, models

from . import authentication, permissions, serializers

logger = getLogger(__name__)


class ServiceAccountViewSet(viewsets.GenericViewSet):
    """Service account management for external integrations."""

    @decorators.action(
        detail=False,
        methods=["post"],
        url_path="token",
        url_name="token",
    )
    def generate_token(self, request, *args, **kwargs):
        """Generate JWT token for user impersonation.

        Token generation endpoint for service-to-service authentication.

        Exchanges service account client_id / client_secret for a scoped JWT token
        that can impersonate a specific user. The service account must have permission
        to impersonate the user's email domain.
        """

        serializer = serializers.JwtSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        client_id = serializer.validated_data["client_id"]
        client_secret = serializer.validated_data["client_secret"]

        try:
            service_account = models.ServiceAccount.objects.get(client_id=client_id)
        except models.ServiceAccount.DoesNotExist as e:
            raise drf_exceptions.AuthenticationFailed("Invalid client_id") from e

        try:
            service_account_secret = models.ServiceAccountSecret.objects.get_from_key(
                client_secret
            )
        except models.ServiceAccountSecret.DoesNotExist as e:
            raise drf_exceptions.AuthenticationFailed("Invalid client_secret") from e

        if (
            service_account.client_id
            != service_account_secret.service_account.client_id
        ):
            raise drf_exceptions.AuthenticationFailed("Invalid client_secret")

        # todo - explain why scope is an email here
        email = serializer.validated_data["scope"]

        if not service_account.can_impersonate_email(email):
            logger.warning(
                "Service account %s denied impersonation of %s",
                service_account.id,
                email,
            )
            return drf_response.Response(
                {
                    "error": "Access denied",
                    "detail": "Cannot impersonate this user. The user's domain may not be authorized in the domain delegation settings for this service account.",
                },
                status=drf_status.HTTP_403_FORBIDDEN,
            )

        try:
            user = models.User.objects.get(email=email)
        except models.User.DoesNotExist as e:
            # todo - create unknown user
            raise drf_exceptions.NotFound(
                {
                    "error": "User not found",
                    "message": f"No user with email '{email}' exists.",
                }
            ) from e

        now = datetime.utcnow()
        scopes = service_account.scopes or []
        payload = {
            # Standard JWT claims
            "iss": settings.INTEGRATIONS_JWT_ISSUER,
            "aud": settings.INTEGRATIONS_JWT_AUDIENCE,
            "iat": now,
            "exp": now
            + timedelta(seconds=settings.INTEGRATIONS_JWT_EXPIRATION_SECONDS),
            # Application claims
            "client_id": str(client_id),
            "scope": " ".join(scopes),
            # Minimal user info
            "user_id": str(user.id),
            "impersonated": True,
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
                "access_token": token,
                "token_type": settings.INTEGRATIONS_JWT_TOKEN_TYPE,
                "expires_in": settings.INTEGRATIONS_JWT_EXPIRATION_SECONDS,
                "scope": " ".join(scopes),
            },
            status=drf_status.HTTP_200_OK,
        )


class RoomViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """External API for room management with scope-based permissions.

    Provides JWT-authenticated access to room operations for external services.
    All operations are scoped and filtered to authenticated user's accessible rooms.
    """

    authentication_classes = [authentication.ServiceAccountJWTAuthentication]
    permission_classes = [api.permissions.IsAuthenticated, permissions.HasRequiredScope]
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
