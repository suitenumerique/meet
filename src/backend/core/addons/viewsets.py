"""Add-ons API endpoints"""

from logging import getLogger

from rest_framework import (
    response as drf_response,
)
from rest_framework import status as drf_status
from rest_framework import throttling, viewsets

from core.addons.service import TokenExchangeService

logger = getLogger(__name__)


class AuthSessionThrottle(throttling.AnonRateThrottle):
    """Throttle request to the addons auth session endpoints."""

    scope = "addons_auth_sessions"


class AuthSessionViewSet(viewsets.ViewSet):
    """ViewSet for managing add-on authentication sessions via token exchange."""

    authentication_classes = []
    permission_classes = []
    throttle_classes = [AuthSessionThrottle]

    def create(self, request):
        """Create a new pending authentication session."""
        session_id = TokenExchangeService().init_session()
        return drf_response.Response(
            {"session_id": session_id}, status=drf_status.HTTP_201_CREATED
        )

    def retrieve(self, request, pk=None):
        """Retrieve authentication session data by session ID."""
        data = TokenExchangeService().get_session(pk)

        if not data:
            return drf_response.Response(
                {"detail": "Session not found or expired."},
                status=drf_status.HTTP_404_NOT_FOUND,
            )

        return drf_response.Response(data, status=drf_status.HTTP_200_OK)

    def destroy(self, request, pk=None):
        """Delete an authentication session by session ID."""
        TokenExchangeService().clear_session(pk)
        return drf_response.Response(
            {"status": "ok"}, status=drf_status.HTTP_204_NO_CONTENT
        )
