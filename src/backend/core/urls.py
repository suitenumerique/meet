"""URL configuration for the core app."""

from django.conf import settings
from django.http import HttpResponse
from django.urls import include, path
from django.views.decorators.http import require_GET

from lasuite.oidc_login.urls import urlpatterns as oidc_urls
from rest_framework.routers import DefaultRouter, SimpleRouter
from rest_framework_simplejwt.views import TokenRefreshView

from core.addons import viewsets as addons_viewsets
from core.api import get_frontend_configuration, viewsets
from core.authentication.views import PKCEOAuthTokenExchangeView
from core.external_api import viewsets as external_viewsets


@require_GET
def mobile_login_landing(request):
    """Empty 204 page used as the success_url marker for native-app PKCE login.

    The PKCE callback view detects this path before swapping in the
    `MOBILE_DEEP_LINK_SCHEME` redirect; users following the web flow never
    reach this page. Restricted to GET so the endpoint can't be reached
    via POST/PUT/etc., per S5122.
    """
    return HttpResponse(status=204)


# - Main endpoints
router = DefaultRouter()
router.register("users", viewsets.UserViewSet, basename="users")
router.register("rooms", viewsets.RoomViewSet, basename="rooms")
router.register("recordings", viewsets.RecordingViewSet, basename="recordings")
router.register("files", viewsets.FileViewSet, basename="files")
router.register(
    "resource-accesses", viewsets.ResourceAccessViewSet, basename="resource_accesses"
)
router.register(
    "addons/sessions",
    addons_viewsets.SessionViewSet,
    basename="addons_sessions",
)

# - External API
external_router = SimpleRouter()
external_router.register(
    "application",
    external_viewsets.ApplicationViewSet,
    basename="external_application",
)
external_router.register(
    "rooms",
    external_viewsets.RoomViewSet,
    basename="external_room",
)

urlpatterns = [
    path("mobile-login", mobile_login_landing, name="mobile_login_landing"),
    path(
        f"api/{settings.API_VERSION}/",
        include(
            [
                *router.urls,
                *oidc_urls,
                path("config/", get_frontend_configuration, name="config"),
                path(
                    "oauth/token/",
                    PKCEOAuthTokenExchangeView.as_view(),
                    name="token_obtain_pair",
                ),
                path(
                    "oauth/token/refresh/",
                    TokenRefreshView.as_view(),
                    name="token_refresh",
                ),
            ]
        ),
    ),
]

if settings.EXTERNAL_API_ENABLED:
    urlpatterns.append(
        path(
            f"external-api/{settings.EXTERNAL_API_VERSION}/",
            include(
                [
                    *external_router.urls,
                ]
            ),
        )
    )
