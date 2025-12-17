"""External API endpoints"""

from datetime import datetime, timedelta, timezone
from logging import getLogger

from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

import jwt
from lasuite.oidc_resource_server.authentication import ResourceServerAuthentication
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


class ApplicationViewSet(viewsets.GenericViewSet):
    """API endpoints for application authentication and token generation."""

    @decorators.action(
        detail=False,
        methods=["post"],
        url_path="token",
        url_name="token",
    )
    def generate_jwt_access_token(self, request, *args, **kwargs):
        """Generate JWT access token for application delegation.

        Validates application credentials and generates a JWT token scoped
        to a specific user email, allowing the application to act on behalf
        of that user.

        Note: The 'scope' parameter accepts an email address to identify the user
        being delegated. This design allows applications to obtain user-scoped tokens
        for delegation purposes. The scope field is intentionally generic and can be
        extended to support other values in the future.

        Reference: https://stackoverflow.com/a/27711422
        """
        serializer = serializers.ApplicationJwtSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        client_id = serializer.validated_data["client_id"]
        client_secret = serializer.validated_data["client_secret"]

        try:
            application = models.Application.objects.get(client_id=client_id)
        except models.Application.DoesNotExist as e:
            raise drf_exceptions.AuthenticationFailed("Invalid credentials") from e

        if not application.active:
            raise drf_exceptions.AuthenticationFailed("Application is inactive")

        if not check_password(client_secret, application.client_secret):
            raise drf_exceptions.AuthenticationFailed("Invalid credentials")

        email = serializer.validated_data["scope"]
        try:
            validate_email(email)
        except ValidationError:
            return drf_response.Response(
                {
                    "error": "Scope should be a valid email address.",
                },
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        if not application.can_delegate_email(email):
            logger.warning(
                "Application %s denied delegation for %s",
                application.client_id,
                email,
            )
            return drf_response.Response(
                {
                    "error": "This application is not authorized for this email domain.",
                },
                status=drf_status.HTTP_403_FORBIDDEN,
            )

        try:
            user = models.User.objects.get(email=email)
        except models.User.DoesNotExist as e:
            if (
                settings.APPLICATION_ALLOW_USER_CREATION
                and settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION
                and not settings.OIDC_USER_SUB_FIELD_IMMUTABLE
            ):
                # Create a pending user without sub, but with an email.
                user = models.User(
                    sub=None,
                    email=email,
                )
                user.set_unusable_password()
                user.save()
                logger.info(
                    "Provisional user created via application: user_id=%s, email=%s, client_id=%s",
                    user.id,
                    email,
                    application.client_id,
                )
            else:
                raise drf_exceptions.NotFound("User not found.") from e

        now = datetime.now(timezone.utc)
        scope = " ".join(application.scopes or [])

        payload = {
            "iss": settings.APPLICATION_JWT_ISSUER,
            "aud": settings.APPLICATION_JWT_AUDIENCE,
            "iat": now,
            "exp": now + timedelta(seconds=settings.APPLICATION_JWT_EXPIRATION_SECONDS),
            "client_id": client_id,
            "scope": scope,
            "user_id": str(user.id),
            "delegated": True,
        }

        token = jwt.encode(
            payload,
            settings.APPLICATION_JWT_SECRET_KEY,
            algorithm=settings.APPLICATION_JWT_ALG,
        )

        return drf_response.Response(
            {
                "access_token": token,
                "token_type": settings.APPLICATION_JWT_TOKEN_TYPE,
                "expires_in": settings.APPLICATION_JWT_EXPIRATION_SECONDS,
                "scope": scope,
            },
            status=drf_status.HTTP_200_OK,
        )


class RoomViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Application-delegated API for room management.

    Provides JWT-authenticated access to room operations for external applications
    acting on behalf of users. All operations are scope-based and filtered to the
    authenticated user's accessible rooms.

    Supported operations:
    - list: List rooms the user has access to (requires 'rooms:list' scope)
    - retrieve: Get room details (requires 'rooms:retrieve' scope)
    - create: Create a new room owned by the user (requires 'rooms:create' scope)
    """

    authentication_classes = [
        authentication.ApplicationJWTAuthentication,
        ResourceServerAuthentication,
    ]
    permission_classes = [
        api.permissions.IsAuthenticated & permissions.HasRequiredRoomScope
    ]
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

        # Log for auditing
        logger.info(
            "Room created via application: room_id=%s, user_id=%s, client_id=%s",
            room.id,
            self.request.user.id,
            getattr(self.request.auth, "client_id", "unknown"),
        )
