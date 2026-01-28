"""URL configuration for the core app."""

from django.conf import settings
from django.urls import include, path

from lasuite.oidc_login.urls import urlpatterns as oidc_urls
from rest_framework.routers import DefaultRouter

from core.addons import views as addons_views
from core.addons import viewsets as addons_viewsets
from core.api import get_frontend_configuration, viewsets
from core.external_api import viewsets as external_viewsets

# - Main endpoints
router = DefaultRouter()
router.register("users", viewsets.UserViewSet, basename="users")
router.register("rooms", viewsets.RoomViewSet, basename="rooms")
router.register("recordings", viewsets.RecordingViewSet, basename="recordings")
router.register(
    "resource-accesses", viewsets.ResourceAccessViewSet, basename="resource_accesses"
)

# - External API
external_router = DefaultRouter()
external_router.register(
    "application",
    external_viewsets.ApplicationViewSet,
    basename="external_application",
)

# - Addons API
addons_router = DefaultRouter()
addons_router.register(
    "addons/sessions",
    addons_viewsets.AuthSessionViewSet,
    basename="addons_auth_sessions",
)

external_router.register(
    "rooms",
    external_viewsets.RoomViewSet,
    basename="external_room",
)

urlpatterns = [
    path(
        f"api/{settings.API_VERSION}/",
        include(
            [
                *router.urls,
                *oidc_urls,
                *addons_router.urls,
                path("config/", get_frontend_configuration, name="config"),
            ]
        ),
    ),
    path(
        "addons/",
        include(
            [
                path("transit/", addons_views.transit_page, name="transit_page"),
                path("redirect/", addons_views.redirect_page, name="redirect_page"),
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
