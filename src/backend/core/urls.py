"""URL configuration for the core app."""

from django.conf import settings
from django.urls import include, path

from lasuite.oidc_login.urls import urlpatterns as oidc_urls
from rest_framework.routers import DefaultRouter, SimpleRouter

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

external_router = DefaultRouter()
external_router.register("rooms", external_viewsets.RoomViewSet, basename="external_rooms")
external_router.register("integrations", external_viewsets.IntegrationViewSet, basename="external_integrations")

urlpatterns = [
    path(
        f"api/{settings.API_VERSION}/",
        include(
            [
                *router.urls,
                *oidc_urls,
                path("config/", get_frontend_configuration, name="config"),
            ]
        ),
    ),
    path(
        f"external-api/{settings.EXTERNAL_API_VERSION}/",
        include(
            [
                *external_router.urls,
            ]
        ),
    ),
]

print('core')
print(external_router.urls)
