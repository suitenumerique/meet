"""API endpoints"""

import uuid
from logging import getLogger

from django.conf import settings
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils.text import slugify

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

from core import models, utils
from core.recording.event.authentication import StorageEventAuthentication
from core.recording.event.exceptions import (
    InvalidBucketError,
    InvalidFileTypeError,
    ParsingEventDataError,
)
from core.recording.event.notification import notification_service
from core.recording.event.parsers import get_parser
from core.recording.worker.exceptions import (
    RecordingStartError,
    RecordingStopError,
)
from core.recording.worker.factories import (
    get_worker_service,
)
from core.recording.worker.mediator import (
    WorkerServiceMediator,
)
from core.services.invitation import InvitationService
from core.services.livekit_events import (
    LiveKitEventsService,
    LiveKitWebhookError,
)
from core.services.lobby import (
    LobbyParticipantNotFound,
    LobbyService,
)
from core.services.room_creation import RoomCreation

from . import permissions, serializers

# pylint: disable=too-many-ancestors

logger = getLogger(__name__)


class NestedGenericViewSet(viewsets.GenericViewSet):
    """
    A generic Viewset aims to be used in a nested route context.
    e.g: `/api/v1.0/resource_1/<resource_1_pk>/resource_2/<resource_2_pk>/`

    It allows to define all url kwargs and lookup fields to perform the lookup.
    """

    lookup_fields: list[str] = ["pk"]
    lookup_url_kwargs: list[str] = []

    def __getattribute__(self, item):
        """
        This method is overridden to allow to get the last lookup field or lookup url kwarg
        when accessing the `lookup_field` or `lookup_url_kwarg` attribute. This is useful
        to keep compatibility with all methods used by the parent class `GenericViewSet`.
        """
        if item in ["lookup_field", "lookup_url_kwarg"]:
            return getattr(self, item + "s", [None])[-1]

        return super().__getattribute__(item)

    def get_queryset(self):
        """
        Get the list of items for this view.

        `lookup_fields` attribute is enumerated here to perform the nested lookup.
        """
        queryset = super().get_queryset()

        # The last lookup field is removed to perform the nested lookup as it corresponds
        # to the object pk, it is used within get_object method.
        lookup_url_kwargs = (
            self.lookup_url_kwargs[:-1]
            if self.lookup_url_kwargs
            else self.lookup_fields[:-1]
        )

        filter_kwargs = {}
        for index, lookup_url_kwarg in enumerate(lookup_url_kwargs):
            if lookup_url_kwarg not in self.kwargs:
                raise KeyError(
                    f"Expected view {self.__class__.__name__} to be called with a URL "
                    f'keyword argument named "{lookup_url_kwarg}". Fix your URL conf, or '
                    "set the `.lookup_fields` attribute on the view correctly."
                )

            filter_kwargs.update(
                {self.lookup_fields[index]: self.kwargs[lookup_url_kwarg]}
            )

        return queryset.filter(**filter_kwargs)


class SerializerPerActionMixin:
    """
    A mixin to allow to define serializer classes for each action.

    This mixin is useful to avoid to define a serializer class for each action in the
    `get_serializer_class` method.
    """

    serializer_classes: dict[str, type] = {}
    default_serializer_class: type = None

    def get_serializer_class(self):
        """
        Return the serializer class to use depending on the action.
        """
        return self.serializer_classes.get(self.action, self.default_serializer_class)


class Pagination(pagination.PageNumberPagination):
    """Pagination to display no more than 100 objects per page sorted by creation date."""

    ordering = "-created_on"
    max_page_size = 100
    page_size_query_param = "page_size"


class UserViewSet(
    mixins.UpdateModelMixin, viewsets.GenericViewSet, mixins.ListModelMixin
):
    """User ViewSet"""

    permission_classes = [permissions.IsSelf]
    queryset = models.User.objects.all()
    serializer_class = serializers.UserSerializer

    def get_queryset(self):
        """
        Limit listed users by querying the email field with a trigram similarity
        search if a query is provided.
        Limit listed users by excluding users already in the document if a document_id
        is provided.
        """
        queryset = self.queryset

        if self.action == "list":
            if not settings.ALLOW_UNSECURE_USER_LISTING:
                return models.User.objects.none()

            # Filter users by email similarity
            if query := self.request.GET.get("q", ""):
                queryset = queryset.filter(email__trigram_word_similar=query)

        return queryset

    @decorators.action(
        detail=False,
        methods=["get"],
        url_name="me",
        url_path="me",
        permission_classes=[permissions.IsAuthenticated],
    )
    def get_me(self, request):
        """
        Return information on currently logged user
        """
        context = {"request": request}
        return drf_response.Response(
            self.serializer_class(request.user, context=context).data
        )


class RequestEntryAnonRateThrottle(throttling.AnonRateThrottle):
    """Throttle Anonymous user requesting room entry"""

    scope = "request_entry"


class CreationCallbackAnonRateThrottle(throttling.AnonRateThrottle):
    """Throttle Anonymous user requesting room generation callback"""

    scope = "creation_callback"


class RoomViewSet(
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    API endpoints to access and perform actions on rooms.
    """

    permission_classes = [permissions.RoomPermissions]
    queryset = models.Room.objects.all()
    serializer_class = serializers.RoomSerializer

    def get_object(self):
        """Allow getting a room by its slug."""
        try:
            uuid.UUID(self.kwargs["pk"])
            filter_kwargs = {"pk": self.kwargs["pk"]}
        except ValueError:
            filter_kwargs = {"slug": slugify(self.kwargs["pk"])}
        queryset = self.filter_queryset(self.get_queryset())
        obj = get_object_or_404(queryset, **filter_kwargs)
        # May raise a permission denied
        self.check_object_permissions(self.request, obj)
        return obj

    def retrieve(self, request, *args, **kwargs):
        """
        Allow unregistered rooms when activated.
        For unregistered rooms we only return a null id and the livekit room and token.
        """
        try:
            instance = self.get_object()
        except Http404:
            if not settings.ALLOW_UNREGISTERED_ROOMS:
                raise
            slug = slugify(self.kwargs["pk"])
            username = request.query_params.get("username", None)
            data = {
                "id": None,
                "livekit": {
                    "url": settings.LIVEKIT_CONFIGURATION["url"],
                    "room": slug,
                    "token": utils.generate_token(
                        room=slug, user=request.user, username=username
                    ),
                },
            }
        else:
            data = self.get_serializer(instance).data

        return drf_response.Response(data)

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

        if callback_id := self.request.data.get("callback_id"):
            RoomCreation().persist_callback_state(callback_id, room)

    @decorators.action(
        detail=True,
        methods=["post"],
        url_path="start-recording",
        permission_classes=[
            permissions.HasPrivilegesOnRoom,
            permissions.IsRecordingEnabled,
        ],
    )
    def start_room_recording(self, request, pk=None):  # pylint: disable=unused-argument
        """Start recording a room."""

        serializer = serializers.StartRecordingSerializer(data=request.data)

        if not serializer.is_valid():
            return drf_response.Response(
                {"detail": "Invalid request."}, status=drf_status.HTTP_400_BAD_REQUEST
            )

        mode = serializer.validated_data["mode"]
        room = self.get_object()

        # May raise exception if an active or initiated recording already exist for the room
        recording = models.Recording.objects.create(room=room, mode=mode)

        models.RecordingAccess.objects.create(
            user=self.request.user, role=models.RoleChoices.OWNER, recording=recording
        )

        worker_service = get_worker_service(mode=recording.mode)
        worker_manager = WorkerServiceMediator(worker_service=worker_service)

        try:
            worker_manager.start(recording)
        except RecordingStartError:
            return drf_response.Response(
                {"error": f"Recording failed to start for room {room.slug}"},
                status=drf_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return drf_response.Response(
            {"message": f"Recording successfully started for room {room.slug}"},
            status=drf_status.HTTP_201_CREATED,
        )

    @decorators.action(
        detail=True,
        methods=["post"],
        url_path="stop-recording",
        permission_classes=[
            permissions.HasPrivilegesOnRoom,
            permissions.IsRecordingEnabled,
        ],
    )
    def stop_room_recording(self, request, pk=None):  # pylint: disable=unused-argument
        """Stop room recording."""

        room = self.get_object()

        try:
            recording = models.Recording.objects.get(
                room=room, status=models.RecordingStatusChoices.ACTIVE
            )
        except models.Recording.DoesNotExist as e:
            raise drf_exceptions.NotFound(
                "No active recording found for this room."
            ) from e

        worker_service = get_worker_service(mode=recording.mode)
        worker_manager = WorkerServiceMediator(worker_service=worker_service)

        try:
            worker_manager.stop(recording)
        except RecordingStopError:
            return drf_response.Response(
                {"error": f"Recording failed to stop for room {room.slug}"},
                status=drf_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return drf_response.Response(
            {"message": f"Recording stopped for room {room.slug}."}
        )

    @decorators.action(
        detail=True,
        methods=["post"],
        url_path="request-entry",
        permission_classes=[],
        throttle_classes=[RequestEntryAnonRateThrottle],
    )
    def request_entry(self, request, pk=None):  # pylint: disable=unused-argument
        """Request entry to a room"""

        serializer = serializers.RequestEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        room = self.get_object()
        lobby_service = LobbyService()

        participant, livekit = lobby_service.request_entry(
            room=room,
            request=request,
            **serializer.validated_data,
        )
        response = drf_response.Response({**participant.to_dict(), "livekit": livekit})
        lobby_service.prepare_response(response, participant.id)

        return response

    @decorators.action(
        detail=True,
        methods=["post"],
        url_path="enter",
        permission_classes=[
            permissions.HasPrivilegesOnRoom,
        ],
    )
    def allow_participant_to_enter(self, request, pk=None):  # pylint: disable=unused-argument
        """Accept or deny a participant's entry request."""

        serializer = serializers.ParticipantEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        room = self.get_object()

        if room.is_public:
            return drf_response.Response(
                {"message": "Room has no lobby system."},
                status=drf_status.HTTP_404_NOT_FOUND,
            )

        lobby_service = LobbyService()

        try:
            lobby_service.handle_participant_entry(
                room_id=room.id,
                **serializer.validated_data,
            )
            return drf_response.Response({"message": "Participant was updated."})

        except LobbyParticipantNotFound:
            return drf_response.Response(
                {"message": "Participant not found."},
                status=drf_status.HTTP_404_NOT_FOUND,
            )

    @decorators.action(
        detail=True,
        methods=["GET"],
        url_path="waiting-participants",
        permission_classes=[
            permissions.HasPrivilegesOnRoom,
        ],
    )
    def list_waiting_participants(self, request, pk=None):  # pylint: disable=unused-argument
        """List waiting participants."""
        room = self.get_object()

        if room.is_public:
            return drf_response.Response({"participants": []})

        lobby_service = LobbyService()

        participants = lobby_service.list_waiting_participants(room.id)
        return drf_response.Response({"participants": participants})

    @decorators.action(
        detail=False,
        methods=["post"],
        url_path="webhooks-livekit",
        permission_classes=[],
    )
    def webhooks_livekit(self, request):
        """Process webhooks from LiveKit."""

        livekit_events_service = LiveKitEventsService()

        try:
            livekit_events_service.receive(request)
            return drf_response.Response(
                {"status": "success"}, status=drf_status.HTTP_200_OK
            )
        except LiveKitWebhookError as e:
            status_code = getattr(e, "status_code", drf_status.HTTP_400_BAD_REQUEST)

            if status_code == drf_status.HTTP_500_INTERNAL_SERVER_ERROR:
                raise e

            return drf_response.Response(
                {"status": "error", "message": str(e)}, status=status_code
            )

    @decorators.action(
        detail=False,
        methods=["post"],
        url_path="creation-callback",
        permission_classes=[],
        throttle_classes=[CreationCallbackAnonRateThrottle],
    )
    def creation_callback(self, request):
        """Retrieve cached room data via an unauthenticated request with a unique ID.

        Designed for interoperability across iframes, popups, and other contexts,
        even on the same domain, bypassing browser security restrictions on direct communication.
        """

        serializer = serializers.CreationCallbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        room = RoomCreation().get_callback_state(
            callback_id=serializer.validated_data.get("callback_id")
        )

        return drf_response.Response(
            {"status": "success", "room": room}, status=drf_status.HTTP_200_OK
        )

    @decorators.action(
        detail=True,
        methods=["post"],
        url_path="invite",
        permission_classes=[
            permissions.HasPrivilegesOnRoom,
        ],
    )
    def invite(self, request, pk=None):  # pylint: disable=unused-argument
        """Send email invitations to join a room.

        This API endpoint allows a user with appropriate privileges to send email invitations
        to one or more recipients, inviting them to join the specified room.
        """

        room = self.get_object()

        serializer = serializers.RoomInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        emails = serializer.validated_data.get("emails")
        emails = list(set(emails))

        InvitationService().invite_to_room(
            room=room, sender=request.user, emails=emails
        )

        return drf_response.Response(
            {"status": "success", "message": "invitations sent"},
            status=drf_status.HTTP_200_OK,
        )


class ResourceAccessListModelMixin:
    """List mixin for resource access API."""

    def get_permissions(self):
        """User only needs to be authenticated to list rooms access"""
        if self.action == "list":
            permission_classes = [permissions.IsAuthenticated]
        else:
            return super().get_permissions()

        return [permission() for permission in permission_classes]

    def get_queryset(self):
        """Return the queryset according to the action."""
        queryset = super().get_queryset()
        if self.action == "list":
            user = self.request.user
            queryset = queryset.filter(
                Q(resource__accesses__user=user),
                resource__accesses__role__in=[
                    models.RoleChoices.ADMIN,
                    models.RoleChoices.OWNER,
                ],
            ).distinct()
        return queryset


class ResourceAccessViewSet(
    ResourceAccessListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    API endpoints to access and perform actions on resource accesses.
    """

    permission_classes = [permissions.ResourceAccessPermission]
    queryset = models.ResourceAccess.objects.all()
    serializer_class = serializers.ResourceAccessSerializer


class RecordingViewSet(
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    API endpoints to access and perform actions on recordings.
    """

    pagination_class = Pagination
    permission_classes = [permissions.HasAbilityPermission]
    queryset = models.Recording.objects.all()
    serializer_class = serializers.RecordingSerializer

    def get_queryset(self):
        """Restrict recordings to the user's ones."""
        user = self.request.user
        return (
            super()
            .get_queryset()
            .filter(Q(accesses__user=user) | Q(accesses__team__in=user.get_teams()))
        )

    @decorators.action(
        detail=False,
        methods=["post"],
        url_path="storage-hook",
        authentication_classes=[StorageEventAuthentication],
        permission_classes=[permissions.IsStorageEventEnabled],
    )
    def on_storage_event_received(self, request, pk=None):  # pylint: disable=unused-argument
        """Handle incoming storage hook events for recordings."""

        parser = get_parser()

        try:
            recording_id = parser.get_recording_id(request.data)

        except ParsingEventDataError as e:
            raise drf_exceptions.PermissionDenied(f"Invalid request data: {e}") from e

        except InvalidBucketError as e:
            raise drf_exceptions.PermissionDenied("Invalid bucket specified") from e

        except InvalidFileTypeError as e:
            return drf_response.Response(
                {"message": f"Ignore this file type, {e}"},
            )

        try:
            recording = models.Recording.objects.get(id=recording_id)
        except models.Recording.DoesNotExist as e:
            raise drf_exceptions.NotFound("No recording found for this event.") from e

        if not recording.is_savable():
            raise drf_exceptions.PermissionDenied(
                f"Recording with ID {recording_id} cannot be saved because it is either,"
                " in an error state or has already been saved."
            )

        # Attempt to notify external services about the recording
        # This is a non-blocking operation - failures are logged but don't interrupt the flow
        notification_succeeded = notification_service.notify_external_services(
            recording
        )

        recording.status = (
            models.RecordingStatusChoices.NOTIFICATION_SUCCEEDED
            if notification_succeeded
            else models.RecordingStatusChoices.SAVED
        )
        recording.save()

        return drf_response.Response(
            {"message": "Event processed."},
        )
