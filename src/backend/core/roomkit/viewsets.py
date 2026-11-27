"""Roomkit API endpoints for meeting-room (SIP) device integration."""

from logging import getLogger

from rest_framework import decorators, viewsets
from rest_framework import (
    exceptions as drf_exceptions,
)
from rest_framework import (
    response as drf_response,
)
from rest_framework import (
    status as drf_status,
)

from core import analytics, audit, auditing, models
from core.api import permissions, throttling
from core.api.feature_flag import FeatureFlag
from core.services.sip_management import SIPException, SIPManagement

from . import authentication, serializers

logger = getLogger(__name__)


class RoomKitViewSet(audit.AuditViewMixin, viewsets.ViewSet):
    """Server-to-server API endpoints for the roomkit integration.

    Groups all interactions between roomkit (SIP) devices and the backend,
    brokered by the LiveKit SIP module. All endpoints are authenticated
    with the roomkit server-to-server tokens.
    """

    authentication_classes = [authentication.ServerToServerAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    audit_pin_refused = False

    @decorators.action(
        detail=False,
        methods=["post"],
        url_path="join",
        throttle_classes=[throttling.RoomKitJoinRateThrottle],
        audit_action=auditing.ROOMKIT_JOIN,
    )
    @FeatureFlag.require("roomkit")
    def join(self, request):
        """Prepare a room for a meeting-room (SIP) device joining by PIN code.

        Called by the LiveKit SIP module when a meeting-room device dials in
        with a PIN code before any WebRTC participant has joined. Resolves the
        room by PIN and creates its SIP dispatch rule, so the device can enter
        without waiting for a WebRTC user.

        The webhook-based creation path is kept: both converge on the same rule
        through the shared SIPManagement.
        """

        serializer = serializers.RoomKitJoinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            room = models.Room.objects.get(
                pin_code=serializer.validated_data["pin_code"]
            )
        except models.Room.DoesNotExist as e:
            self.audit_pin_refused = True
            raise drf_exceptions.NotFound("No room found for this PIN code.") from e
        self.audit_target = room

        try:
            created = SIPManagement().ensure_dispatch_rule(room)
        except SIPException as e:
            raise drf_exceptions.APIException("Could not create dispatch rule.") from e
        self.audit_details = {"dispatch_rule_created": created}

        analytics.capture(
            request.user,
            analytics.AnalyticsEvent.ROOMKIT_JOINED,
            {
                "room_id": str(room.pk),
                "dispatch_rule_created": created,
            },
        )

        logger.info(
            "Roomkit join requested: room_id=%s, dispatch_rule_created=%s",
            room.id,
            created,
        )

        return drf_response.Response(
            {"status": "success"},
            status=drf_status.HTTP_200_OK,
        )

    def get_audit_fields(self, status_code, error=None):
        """Report an unknown PIN code as a refusal, though answered with a 404."""
        fields = super().get_audit_fields(status_code, error)
        if self.audit_pin_refused:
            fields["outcome"] = audit.Outcome.DENIED
        return fields
