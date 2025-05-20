"""URL configuration for the core app."""

from django.conf import settings
from django.urls import include, path

from lasuite.oidc_login.urls import urlpatterns as oidc_urls
from lasuite.oidc_resource_server.urls import urlpatterns as resource_server_urls
from rest_framework.routers import DefaultRouter

from core.api import get_frontend_configuration, viewsets
from core.user_token import viewsets as user_token_viewsets

# - Main endpoints
router = DefaultRouter()
router.register("users", viewsets.UserViewSet, basename="users")
router.register("rooms", viewsets.RoomViewSet, basename="rooms")
router.register("recordings", viewsets.RecordingViewSet, basename="recordings")
router.register(
    "resource-accesses", viewsets.ResourceAccessViewSet, basename="resource_accesses"
)
router.register(
    "user-tokens",
    user_token_viewsets.UserTokenViewset,
    basename="user_tokens",
)

urlpatterns = [
    path(
        f"api/{settings.API_VERSION}/",
        include(
            [
                *router.urls,
                *oidc_urls,
                *resource_server_urls,
                path("config/", get_frontend_configuration, name="config"),
            ]
        ),
    ),
]
