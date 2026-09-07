"""External API endpoints"""

import copy
from logging import getLogger

from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from django_filters import rest_framework as django_filters
from lasuite.oidc_resource_server.authentication import ResourceServerAuthentication
from rest_framework import decorators, mixins, viewsets
from rest_framework import (
    exceptions as drf_exceptions,
)
from rest_framework import (
    parsers as drf_parsers,
)
from rest_framework import (
    response as drf_response,
)
from rest_framework import (
    status as drf_status,
)

from core import analytics, api, models
from core.api.feature_flag import FeatureFlag
from core.services.jwt_token import JwtTokenService
from core.services.room_management import RoomManagement

from ..services.provisional_user_service import (
    ProvisionalUserCreationDisabledError,
    ProvisionalUserIntegrityError,
    ProvisionalUserService,
)
from . import authentication, permissions, serializers

logger = getLogger(__name__)


class ApplicationViewSet(viewsets.ViewSet):
    """API endpoints for application authentication and token generation."""

    @decorators.action(
        detail=False,
        methods=["post"],
        url_path="token",
        url_name="token",
        parser_classes=[drf_parsers.FormParser, drf_parsers.JSONParser],
    )
    @FeatureFlag.require("application")
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

        if not check_password(client_secret, application.client_secret):
            raise drf_exceptions.AuthenticationFailed("Invalid credentials")

        if not application.is_active:
            raise drf_exceptions.AuthenticationFailed("Application is inactive")

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
            user, _ = ProvisionalUserService().get_or_create(email, client_id)
        except ProvisionalUserCreationDisabledError as not_found_error:
            raise drf_exceptions.NotFound("User not found.") from not_found_error
        except ProvisionalUserIntegrityError:
            return drf_response.Response(
                {"error": "Failed to create or retrieve provisional user."},
                status=drf_status.HTTP_409_CONFLICT,
            )

        scope = " ".join(application.scopes or [])

        token_service = JwtTokenService(
            secret_key=settings.APPLICATION_JWT_SECRET_KEY,
            algorithm=settings.APPLICATION_JWT_ALG,
            issuer=settings.APPLICATION_JWT_ISSUER,
            audience=settings.APPLICATION_JWT_AUDIENCE,
            expiration_seconds=settings.APPLICATION_JWT_EXPIRATION_SECONDS,
            token_type=settings.APPLICATION_JWT_TOKEN_TYPE,
        )

        data = token_service.generate_jwt(
            user,
            scope,
            {
                "client_id": client_id,
                "delegated": True,
            },
        )

        return drf_response.Response(
            data,
            status=drf_status.HTTP_200_OK,
        )


class RoomViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Application-delegated API for room management.

    Provides JWT-authenticated access to room operations for external applications
    acting on behalf of users. All operations are scope-based and filtered to the
    authenticated user's accessible rooms.

    Supported operations:
    - list: List rooms the user has access to (requires 'rooms:list' scope).
      The `slug` query parameter filters the listing by exact slug.
    - retrieve: Get room details (requires 'rooms:retrieve' scope)
    - create: Create a new room owned by the user (requires 'rooms:create' scope)
    - partial_update: Update a room's access level and configuration, for
      administrators and owners only (requires 'rooms:update' scope)
    - grant_access: Grant administrator or member access on a room to another
      user identified by email, for administrators and owners only
      (requires 'rooms:grant-access' scope)
    """

    http_method_names = ["get", "post", "patch", "head", "options"]

    authentication_classes = [
        authentication.ApplicationJWTAuthentication,
        authentication.AddonsJWTAuthentication,
        ResourceServerAuthentication,
    ]
    permission_classes = [
        api.permissions.IsAuthenticated
        & permissions.HasRequiredRoomScope
        & permissions.RoomPermissions
    ]
    queryset = models.Room.objects.all()
    serializer_class = serializers.RoomSerializer
    filter_backends = (django_filters.DjangoFilterBackend,)
    filterset_fields = ("slug",)

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

    def _track_room_event(self, room, event, **extra_properties):
        """Log a room operation for auditing and forward it to analytics."""

        auth_method = type(self.request.successful_authenticator).__name__
        client_id = (self.request.auth or {}).get("client_id", "unknown")

        # Log for auditing
        details = "".join(f", {key}={value}" for key, value in extra_properties.items())
        logger.info(
            "Room %s via application: room_id=%s, user_id=%s, client_id=%s, auth_method=%s%s",
            event.removeprefix("room_"),
            room.id,
            self.request.user.id,
            client_id,
            auth_method,
            details,
        )

        analytics.capture(
            self.request.user,
            event,
            {
                "room_id": str(room.pk),
                "access_level": room.access_level,
                "client_id": client_id,
                "external_api": True,
                "auth_method": auth_method,
                **extra_properties,
                "$set": {"email": self.request.user.email},
            },
        )

    def perform_create(self, serializer: serializers.RoomSerializer):
        """Set the current user as owner of the newly created room."""
        room = serializer.save()
        models.ResourceAccess.objects.create(
            resource=room,
            user=self.request.user,
            role=models.RoleChoices.OWNER,
        )

        self._track_room_event(room, analytics.AnalyticsEvent.ROOM_CREATED)

    def perform_update(self, serializer: serializers.RoomSerializer):
        """Persist the room update, sync it to LiveKit, then log and track it."""

        previous_values = {
            "access_level": serializer.instance.access_level,
            "configuration": copy.deepcopy(serializer.instance.configuration),
        }

        room = serializer.save()

        # Report the fields that actually changed, not the ones that were submitted.
        updated_fields = sorted(
            field
            for field, previous_value in previous_values.items()
            if getattr(room, field) != previous_value
        )

        if updated_fields:
            RoomManagement.sync_room_metadata(room)

        self._track_room_event(
            room,
            analytics.AnalyticsEvent.ROOM_UPDATED,
            updated_fields=updated_fields,
            previous_access_level=previous_values["access_level"],
        )

    @decorators.action(
        detail=True,
        methods=["post"],
        url_path="grant-access",
        url_name="grant_access",
    )
    def grant_access(self, request, pk=None):  # pylint: disable=unused-argument
        """Grant administrator (or member) access on the room to another user.

        Allows an integration acting on behalf of a room administrator or owner
        to delegate host controls (admitting lobby participants, managing
        recordings, etc.) to another user. The delegate is identified by email;
        if no account matches, a provisional user is created and claimed on the
        delegate's first OIDC login.

        Body: {"email": "<delegate@example.com>", "role": "administrator"|"member"}

        The operation is idempotent: re-granting the same role to the same email
        returns 200 with "created": false. An existing owner is never demoted.
        """
        room = self.get_object()

        serializer = serializers.GrantAccessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        role = serializer.validated_data["role"]

        client_id = (request.auth or {}).get("client_id", "unknown")

        try:
            delegate, user_created = ProvisionalUserService().get_or_create(
                email, client_id
            )
        except ProvisionalUserCreationDisabledError as not_found_error:
            raise drf_exceptions.NotFound(
                "Delegate user not found and provisional user creation is disabled."
            ) from not_found_error
        except ProvisionalUserIntegrityError:
            return drf_response.Response(
                {"error": "Failed to create or retrieve delegate user."},
                status=drf_status.HTTP_409_CONFLICT,
            )

        access = models.ResourceAccess.objects.filter(
            resource=room, user=delegate
        ).first()
        if access:
            if access.role == models.RoleChoices.OWNER:
                return drf_response.Response(
                    {
                        "email": email,
                        "role": access.role,
                        "created": False,
                        "provisional_user_created": user_created,
                        "detail": "Delegate is already owner of this room.",
                    },
                    status=drf_status.HTTP_200_OK,
                )
            access.role = role
            access.save(update_fields=["role"])
            access_created = False
        else:
            access = models.ResourceAccess.objects.create(
                resource=room, user=delegate, role=role
            )
            access_created = True

        logger.info(
            "Room access granted via application: room_id=%s, delegate_email=%s, "
            "role=%s, created_access=%s, provisional_user_created=%s, "
            "user_id=%s, client_id=%s, auth_method=%s",
            room.id,
            email,
            role,
            access_created,
            user_created,
            request.user.id,
            client_id,
            type(request.successful_authenticator).__name__,
        )

        return drf_response.Response(
            {
                "email": email,
                "role": access.role,
                "created": access_created,
                "provisional_user_created": user_created,
            },
            status=(
                drf_status.HTTP_201_CREATED
                if access_created
                else drf_status.HTTP_200_OK
            ),
        )
