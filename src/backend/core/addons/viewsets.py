"""Add-ons API endpoints"""

from logging import getLogger

from django.conf import settings
from django.core.exceptions import SuspiciousOperation

from rest_framework import (
    response as drf_response,
)
from rest_framework import decorators
from rest_framework import status as drf_status
from rest_framework import viewsets

from core.addons.service import TokenExchangeService, SessionOwnershipError

logger = getLogger(__name__)


class AuthSessionViewSet(viewsets.ViewSet):
    """ViewSet for managing add-on authentication sessions via token exchange."""

    authentication_classes = []
    permission_classes = []
    throttle_classes = []

    def create(self, request):
        """Create a pending session.

        Returns session_id in the body (client forwards it to the 3rd-party view).
        Sets result_token as an HttpOnly cookie (the only poll credential).
        """
        session_id, result_token, transit_token = TokenExchangeService().init_session()
        response = drf_response.Response(
            {"session_id": session_id, "transit_token": transit_token}, status=drf_status.HTTP_201_CREATED
        )
        response.set_cookie(
            key=settings.ADDONS_RESULT_TOKEN_COOKIE_NAME,
            value=result_token,
            max_age=6000,
            httponly=True,
            secure=True,
            samesite="None",
        )
        return response

    @decorators.action(
        detail=False,
        methods=["post"],
        url_name="wip",
        url_path="wip",
        permission_classes=[],
        authentication_classes=[],
    )
    def long_poll(self, request):
        """Long-poll endpoint — only the cookie is accepted, never a session_id.

        pk is intentionally ignored; the session is resolved from the cookie.
        """

        result_token = request.COOKIES.get(settings.ADDONS_RESULT_TOKEN_COOKIE_NAME)
        session_id = request.data.get("session_id")

        if not result_token:
            return drf_response.Response(
                {"detail": "Missing result token."},
                status=drf_status.HTTP_401_UNAUTHORIZED,
            )

        if not session_id:
            return drf_response.Response(
                {"detail": "Missing result session id."},
                status=drf_status.HTTP_401_UNAUTHORIZED,
            )

        try:
            data = TokenExchangeService().get_session_by_token(
                result_token=result_token,
                claimed_session_id=session_id,
            )
        except SessionOwnershipError as e:
            raise SuspiciousOperation(str(e)) from e

        if not data:
            return drf_response.Response(
                {"detail": "Session not found or expired."},
                status=drf_status.HTTP_404_NOT_FOUND,
            )

        if data.get("state") == "pending":
            return drf_response.Response(
                {"state": "pending"},
                status=drf_status.HTTP_202_ACCEPTED,
            )

        return drf_response.Response(data, status=drf_status.HTTP_200_OK)

    def destroy(self, request, pk=None):
        """Explicit session teardown, resolves via cookie, not pk."""

        result_token = request.COOKIES.get(settings.ADDONS_RESULT_TOKEN_COOKIE_NAME)
        if not result_token:
            return drf_response.Response(status=drf_status.HTTP_204_NO_CONTENT)

        # We need the session_id to clear both keys — resolve it first
        session_id = TokenExchangeService().token_to_session(result_token)
        if session_id:
            TokenExchangeService().clear_session(session_id, result_token)

        response = drf_response.Response(status=drf_status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.ADDONS_RESULT_TOKEN_COOKIE_NAME)

        return response
