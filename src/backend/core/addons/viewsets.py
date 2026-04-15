"""Add-ons API endpoints"""

from logging import getLogger

from django.conf import settings
from django.core.exceptions import SuspiciousOperation

from rest_framework import decorators, viewsets
from rest_framework import (
    response as drf_response,
)
from rest_framework import status as drf_status

from core.addons.service import (
    CSRFTokenError,
    SessionDataError,
    SessionExpiredError,
    SessionNotFoundError,
    SuspiciousSessionError,
    TokenExchangeService,
    TransitTokenError,
)
from core.api.feature_flag import FeatureFlag
from core.api.permissions import IsAuthenticated

logger = getLogger(__name__)


class SessionViewSet(viewsets.ViewSet):
    """ViewSet for managing add-on authentication sessions via token exchange.

    Implements a three-step flow that lets a third-party add-on (running in an
    embedded iframe) obtain an access token without exposing it to client-side
    JavaScript:

    1. /init: the add-on opens a session and receives a short-lived transit
       token (used to bootstrap the OAuth-style exchange in a dialog) and a
       CSRF token. The opaque session id is stored in an HttpOnly, Secure,
       SameSite=None cookie so it can accompany cross-origin polls.
    2. /poll: the add-on polls until the session transitions from pending to
       authenticated. On the terminal read, the session payload (access
       token, token type, expiry, etc.) is returned, the session is evicted
       server-side, and the session cookie is cleared so the tokens can be
       retrieved exactly once.
    3. /exchange: called from the post-login callback page on our own domain,
       after the user has authenticated in a dialog opened by the addon. The
       transit token (carried client-side via postMessage + sessionStorage)
       is redeemed here for the authenticated user's access token, which is
       stored server-side against the session. Requires an authenticated
       user — that user is whose access token gets bound to the session.

    /init and /poll authenticate the caller through the session cookie +
    CSRF token pair alone — no user login is required, since the whole point
    of the flow is to bootstrap one. /exchange, by contrast, requires an
    authenticated user and does not use the addonsSid cookie.
    """

    throttle_classes = []

    @decorators.action(
        detail=False,
        methods=["POST"],
        url_path="init",
        authentication_classes=[],
        permission_classes=[],
    )
    @FeatureFlag.require("addons")
    def init(self, request):
        """Open a new add-on authentication session.

        Creates a fresh session server-side and returns the credentials the
        add-on needs to drive the rest of the flow.
        """

        transit_token, session_id, csrf_token = TokenExchangeService().init_session()

        response = drf_response.Response(
            {"transit_token": transit_token, "csrf_token": csrf_token},
            status=drf_status.HTTP_201_CREATED,
        )

        # SameSite=None allows the cookie to be sent on cross-origin requests,
        # which is required because the /poll endpoint is called from an iframe
        # embedded in a third-party site. Secure=True is mandatory when SameSite=None.
        # HttpOnly prevents JS access, so the cookie can only be read by the server.
        response.set_cookie(
            key=settings.ADDONS_SESSION_ID_COOKIE,
            value=session_id,
            max_age=settings.ADDONS_SESSION_TTL,
            httponly=True,
            secure=True,
            samesite="None",
        )

        return response

    @decorators.action(
        detail=False,
        methods=["POST"],
        url_path="poll",
        authentication_classes=[],
        permission_classes=[],
    )
    @FeatureFlag.require("addons")
    def poll(self, request):
        """Poll a session for its current state and, if terminal, consume it.

        Authenticates the caller using the addonsSid cookie (set by
        /init) together with the X-CSRF-Token header, which must match
        the CSRF token issued for that session. The session id alone is not
        sufficient — both must be presented and must correspond.

        Behavior depends on the session's current state:

        - **Pending**: the token exchange has not yet completed. Returns
          202 Accepted with `{"state": "pending"}`. The cookie is preserved
          so the add-on can keep polling.
        - **Authenticated** (or any other terminal state): returns 200 OK
          with the session payload (access token, token type, expiry, etc.)
          and clears the `addonsSid` cookie. The session is also evicted
          server-side on this terminal read, so the tokens can be retrieved
          exactly once.

        A CSRF mismatch is treated as a `SuspiciousOperation` rather than a
        normal 4xx, so it is logged by Django's security middleware and
        surfaced as a 400 without leaking which check failed.
        """

        session_id = request.COOKIES.get(settings.ADDONS_SESSION_ID_COOKIE)
        submitted_csrf = request.headers.get("X-CSRF-Token")

        if not session_id:
            return drf_response.Response(
                {"detail": "Missing credentials."},
                status=drf_status.HTTP_401_UNAUTHORIZED,
            )

        if not submitted_csrf:
            return drf_response.Response(
                {"detail": "Missing CSRF token."},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        service = TokenExchangeService()

        try:
            service.verify_csrf(session_id, submitted_csrf)
        except CSRFTokenError as e:
            raise SuspiciousOperation(str(e)) from e

        try:
            session = service.get_session(session_id)
        except SessionNotFoundError:
            return drf_response.Response(
                {"detail": "Session not found."},
                status=drf_status.HTTP_404_NOT_FOUND,
            )
        except SessionDataError:
            return drf_response.Response(
                {"detail": "Invalid or expired session."},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        if service.is_session_pending(session):
            return drf_response.Response(
                {"state": "pending"}, status=drf_status.HTTP_202_ACCEPTED
            )

        response = drf_response.Response(session, status=drf_status.HTTP_200_OK)
        response.delete_cookie(
            key=settings.ADDONS_SESSION_ID_COOKIE,
            samesite="None",
        )

        return response

    @decorators.action(
        detail=False,
        methods=["POST"],
        url_path="exchange",
        permission_classes=[IsAuthenticated],
    )
    @FeatureFlag.require("addons")
    def exchange(self, request):
        """Redeem a transit token for an access token bound to the current user.

        Called from the post-OIDC callback page on our own domain. The transit
        token was issued by /init, passed to the authentication dialog via
        postMessage, stashed in sessionStorage, and read back by this page
        after login completes.

        The authenticated user (request.user) is whose access token gets stored
        against the session. On success, the addon's next /poll will transition
        from pending to authenticated and receive the token payload.

        Transit tokens are single-use: a replayed token is rejected with 400.
        """

        transit_token = request.data.get("transit_token")
        if not transit_token:
            return drf_response.Response(
                {"detail": "Missing transit_token."},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        service = TokenExchangeService()

        try:
            session_id = service.consume_transit_token(transit_token)
        except TransitTokenError:
            return drf_response.Response(
                {"detail": "Invalid or expired transit token."},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        try:
            service.set_access_token(request.user, session_id)
        except SessionNotFoundError:
            return drf_response.Response(
                {"detail": "Session not found."},
                status=drf_status.HTTP_404_NOT_FOUND,
            )
        except (SessionDataError, SessionExpiredError, SuspiciousSessionError):
            return drf_response.Response(
                {"detail": "Invalid or expired session."},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        return drf_response.Response({"status": "ok"}, status=drf_status.HTTP_200_OK)
