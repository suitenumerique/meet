"""External API endpoints"""

import copy

from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

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

from core import analytics, api, audit, auditing, models
from core.api.feature_flag import FeatureFlag
from core.services.jwt_token import JwtTokenService
from core.services.room_management import RoomManagement

from ..services.provisional_user_service import (
    ProvisionalUserCreationDisabledError,
    ProvisionalUserIntegrityError,
    ProvisionalUserService,
)
from . import authentication, permissions, serializers


class ApplicationViewSet(audit.AuditViewMixin, viewsets.ViewSet):
    """API endpoints for application authentication and token generation."""

    audit_actor = None
    audit_client_id = None

    @decorators.action(
        detail=False,
        methods=["post"],
        url_path="token",
        url_name="token",
        parser_classes=[drf_parsers.FormParser, drf_parsers.JSONParser],
        audit_action=auditing.APPLICATION_TOKEN_ISSUE,
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
        email = serializer.validated_data["scope"]

        self.audit_client_id = client_id
        self.audit_details = {"requested_domain": audit.email_domain(email)}

        try:
            application = models.Application.objects.get(client_id=client_id)
        except models.Application.DoesNotExist as e:
            raise drf_exceptions.AuthenticationFailed("Invalid credentials") from e

        if not check_password(client_secret, application.client_secret):
            raise drf_exceptions.AuthenticationFailed("Invalid credentials")

        if not application.is_active:
            raise drf_exceptions.AuthenticationFailed("Application is inactive")

        self.audit_target = application

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
            return drf_response.Response(
                {
                    "error": "This application is not authorized for this email domain.",
                },
                status=drf_status.HTTP_403_FORBIDDEN,
            )

        try:
            user, created = ProvisionalUserService().get_or_create(email, client_id)
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

        self.audit_actor = user
        self.audit_details = {
            "scopes": list(application.scopes or []),
            "user_provisioned": created,
            "expires_in": settings.APPLICATION_JWT_EXPIRATION_SECONDS,
        }

        return drf_response.Response(
            data,
            status=drf_status.HTTP_200_OK,
        )

    def get_audit_fields(self, status_code, error=None):
        """Report the application as the actor once its credentials are verified.

        Until then the submitted client id is only a claim: it is kept apart so
        that it never names the application or the tenant of the event. Either
        way, a session the request carries never makes its account the actor.
        """
        application = self.audit_target
        fields = {
            **super().get_audit_fields(status_code, error),
            "auth_method": "client_credentials",
            "actor_type": audit.ActorType.ANONYMOUS,
        }
        if application:
            fields |= {
                "actor_type": audit.ActorType.APPLICATION,
                "client_id": application.client_id,
            }
        else:
            fields["claimed_client_id"] = self.audit_client_id
        return fields


class RoomViewSet(
    audit.AuditViewMixin,
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
    - list: List rooms the user has access to (requires 'rooms:list' scope)
    - retrieve: Get room details (requires 'rooms:retrieve' scope)
    - create: Create a new room owned by the user (requires 'rooms:create' scope)
    - partial_update: Update a room's access level and configuration, for
      administrators and owners only (requires 'rooms:update' scope)
    """

    http_method_names = ["get", "post", "patch", "head", "options"]

    audit_actions = {
        "list": auditing.ROOM_LIST,
        "retrieve": auditing.ROOM_RETRIEVE,
        "create": auditing.ROOM_CREATE,
        "partial_update": auditing.ROOM_UPDATE,
    }

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
            self.audit_details = {"total": self.paginator.page.paginator.count}
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        self.audit_details = {"total": len(serializer.data)}
        return drf_response.Response(serializer.data)

    def _track_room_event(self, room, event, **extra_properties):
        """Add a room operation to the audit event and forward it to analytics."""

        self.audit_target = room
        self.audit_details = extra_properties

        auth_method = type(self.request.successful_authenticator).__name__
        client_id = (self.request.auth or {}).get("client_id", "unknown")

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
        self.audit_target = room
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
