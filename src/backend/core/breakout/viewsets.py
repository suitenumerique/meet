"""API endpoints for breakout sessions, nested under a meeting."""

from django.db.models import prefetch_related_objects
from django.shortcuts import get_object_or_404
from django.urls.converters import UUIDConverter

from rest_framework import decorators, viewsets
from rest_framework import response as drf_response
from rest_framework import status as drf_status

from core import models
from core.api import permissions
from core.api.feature_flag import FeatureFlag

from . import serializers, services


class BreakoutSessionViewSet(viewsets.GenericViewSet):
    """Open, list and close a meeting's breakout sessions.

    With the flag off, opening answers 404 to a caller its authentication and
    permissions let through, while a session left open can still be listed and
    closed.
    """

    permission_classes = [permissions.HasPrivilegesOnRoom]
    serializer_class = serializers.BreakoutSessionSerializer
    lookup_value_regex = UUIDConverter.regex

    def get_queryset(self):
        """The sessions of the meeting in the URL, with their rooms and assignments."""
        return models.BreakoutSession.objects.filter(
            room_id=self.kwargs["room_id"]
        ).prefetch_related("rooms__assignments")

    def get_room(self):
        """The meeting in the URL, checked against the action's permissions."""
        room = get_object_or_404(models.Room, pk=self.kwargs["room_id"])
        self.check_object_permissions(self.request, room)
        return room

    def list(self, request, *args, **kwargs):
        """The meeting's active session, as a list of zero or one."""
        room = self.get_room()
        sessions = services.active_sessions(room.id).prefetch_related(
            "rooms__assignments"
        )
        return drf_response.Response(self.get_serializer(sessions, many=True).data)

    @FeatureFlag.require("breakout_rooms")
    def create(self, request, *args, **kwargs):
        """Open a session with its rooms and assignments."""
        room = self.get_room()
        serializer = serializers.OpenBreakoutSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = services.open_session(
            room,
            request.user,
            serializer.validated_data["rooms"],
            stop_recording=serializer.validated_data["stop_recording"],
        )
        prefetch_related_objects([session], "rooms__assignments")
        return drf_response.Response(
            self.get_serializer(session).data, status=drf_status.HTTP_201_CREATED
        )

    @decorators.action(detail=True, methods=["post"])
    def close(self, request, pk=None, **kwargs):
        """Close a session; closing it again answers the same."""
        self.get_room()
        session = services.close_session(get_object_or_404(self.get_queryset(), pk=pk))
        return drf_response.Response(self.get_serializer(session).data)
