"""Add-ons views."""

from django.conf import settings
from django.core.exceptions import SuspiciousOperation
from django.shortcuts import redirect, render
from django.utils.translation import gettext_lazy as _
from django.views.decorators.http import require_http_methods

from core.addons.service import SessionState, TokenExchangeService


def render_error(request, message, status=400):
    """Render simple error page."""
    return render(request, "addons/error.html", {"message": message}, status=status)


@require_http_methods(["GET"])
def transit_page(request):
    """Initialize authentication flow for add-on session."""

    session_id = request.GET.get("session_id")

    if not session_id:
        return render_error(request, _("Session ID is required."), status=400)

    data = TokenExchangeService().get_session(session_id)

    if not data:
        return render_error(request, _("Session not found or expired."), status=404)

    if data.get("state") != SessionState.PENDING:
        return render_error(request, _("Invalid session state."), status=400)

    request.session[settings.ADDONS_SESSION_KEY_AUTH] = session_id

    return_to = request.build_absolute_uri("/addons/redirect")
    return redirect(f"/api/{settings.API_VERSION}/authenticate/?returnTo={return_to}")


@require_http_methods(["GET"])
def redirect_page(request):
    """Complete authentication and close the popup window."""

    if not request.user.is_authenticated:
        return render_error(request, _("Authentication required."), status=401)

    session_id = request.session.pop(settings.ADDONS_SESSION_KEY_AUTH, None)

    if not session_id:
        return render_error(request, _("No active session found."), status=404)

    try:
        TokenExchangeService().set_access_token(request.user, session_id)
    except SuspiciousOperation:
        return render_error(request, _("Invalid or expired session."), status=400)

    return render(request, "addons/redirect_success.html")
