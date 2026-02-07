"""Meet core API endpoints"""

from django.conf import settings
from django.core.exceptions import ValidationError

from rest_framework import exceptions as drf_exceptions
from rest_framework import views as drf_views
from rest_framework.decorators import api_view
from rest_framework.response import Response


def exception_handler(exc, context):
    """Handle Django ValidationError as an accepted exception.

    For the parameters, see ``exception_handler``
    This code comes from twidi's gist:
    https://gist.github.com/twidi/9d55486c36b6a51bdcb05ce3a763e79f
    """
    if isinstance(exc, ValidationError):
        if hasattr(exc, "message_dict"):
            detail = exc.message_dict
        elif hasattr(exc, "message"):
            detail = exc.message
        elif hasattr(exc, "messages"):
            detail = exc.messages
        else:
            detail = ""

        exc = drf_exceptions.ValidationError(detail=detail)

    return drf_views.exception_handler(exc, context)


# pylint: disable=unused-argument
@api_view(["GET"])
def get_frontend_configuration(request):
    """Returns the frontend configuration dict as configured in settings."""
    frontend_configuration = {
        "LANGUAGE_CODE": settings.LANGUAGE_CODE,
        "recording": {
            "is_enabled": settings.RECORDING_ENABLE,
            "available_modes": settings.RECORDING_WORKER_CLASSES.keys(),
            "expiration_days": settings.RECORDING_EXPIRATION_DAYS,
            "max_duration": settings.RECORDING_MAX_DURATION,
            "screen_recording_permission": settings.RECORDING_SCREEN_PERMISSION,
            "transcript_permission": settings.RECORDING_TRANSCRIPT_PERMISSION,
        },
        "telephony": {
            "enabled": settings.ROOM_TELEPHONY_ENABLED,
            "phone_number": settings.ROOM_TELEPHONY_PHONE_NUMBER
            if settings.ROOM_TELEPHONY_ENABLED
            else None,
            "default_country": settings.ROOM_TELEPHONY_DEFAULT_COUNTRY,
        },
        "subtitle": {"enabled": settings.ROOM_SUBTITLE_ENABLED},
        "livekit": {
            "url": settings.LIVEKIT_CONFIGURATION["url"],
            "force_wss_protocol": settings.LIVEKIT_FORCE_WSS_PROTOCOL,
            "enable_firefox_proxy_workaround": settings.LIVEKIT_ENABLE_FIREFOX_PROXY_WORKAROUND,
            "default_sources": settings.LIVEKIT_DEFAULT_SOURCES,
        },
    }
    frontend_configuration.update(settings.FRONTEND_CONFIGURATION)
    return Response(frontend_configuration)
