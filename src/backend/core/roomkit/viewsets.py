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

from core import analytics, models
from core.api import permissions, throttling
from core.api.feature_flag import FeatureFlag
from core.services.telephony import TelephonyException, TelephonyService

from . import authentication, serializers

logger = getLogger(__name__)


class RoomKitViewSet(viewsets.ViewSet):
    """Server-to-server API endpoints for the roomkit integration.

    Groups all interactions between roomkit (SIP) devices and the backend,
    brokered by the LiveKit SIP module. All endpoints are authenticated
    with the roomkit server-to-server tokens.
    """

    authentication_classes = [authentication.ServerToServerAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(
        detail=False,
        methods=["post"],
        url_path="join",
        throttle_classes=[throttling.RoomKitJoinRateThrottle],
    )
    @FeatureFlag.require("roomkit")
    def join(self, request):
        """Prepare a room for a meeting-room (SIP) device joining by PIN code.

        Called by the LiveKit SIP module when a meeting-room device dials in
        with a PIN code before any WebRTC participant has joined. Resolves the
        room by PIN and creates its SIP dispatch rule, so the device can enter
        without waiting for a WebRTC user.

        The webhook-based creation path is kept: both converge on the same rule
        through the shared TelephonyService.
        """

        serializer = serializers.RoomKitJoinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            room = models.Room.objects.get(
                pin_code=serializer.validated_data["pin_code"]
            )
        except models.Room.DoesNotExist as e:
            raise drf_exceptions.NotFound("No room found for this PIN code.") from e

        try:
            created = TelephonyService().ensure_dispatch_rule(room)
        except TelephonyException as e:
            raise drf_exceptions.APIException("Could not create dispatch rule.") from e

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
