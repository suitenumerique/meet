"""URL configuration for the Meet project"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.urls import include, path
from django.views.decorators.csp import csp_override, csp_report_only_override

from drf_spectacular.views import (
    SpectacularJSONAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)


def without_csp(view):
    """
    Serve a view without CSP headers: Swagger runs an inline script, and both API
    docs use inline styles without a nonce (Redoc also loads Google Fonts).
    """
    return csp_override({})(csp_report_only_override({})(view))


urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("core.urls")),
    path("", include("lasuite.oidc_resource_server.urls")),
]

if settings.DEBUG:
    urlpatterns = (
        urlpatterns
        + staticfiles_urlpatterns()
        + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    )


if settings.USE_SWAGGER or settings.DEBUG:
    urlpatterns += [
        path(
            f"api/{settings.API_VERSION}/swagger.json",
            SpectacularJSONAPIView.as_view(
                api_version=settings.API_VERSION,
                urlconf="core.urls",
            ),
            name="client-api-schema",
        ),
        path(
            f"api/{settings.API_VERSION}/swagger/",
            without_csp(SpectacularSwaggerView.as_view(url_name="client-api-schema")),
            name="swagger-ui-schema",
        ),
        path(
            f"api/{settings.API_VERSION}/redoc/",
            without_csp(SpectacularRedocView.as_view(url_name="client-api-schema")),
            name="redoc-schema",
        ),
    ]
