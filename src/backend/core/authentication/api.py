"""API endpoint for exchanging a one-time code for a session ID."""

from django.conf import settings
from django.core.cache import cache

from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .views import EXCHANGE_CODE_PREFIX


class SessionExchangeSerializer(serializers.Serializer):
    """Validates the exchange code request."""

    code = serializers.CharField(max_length=64, min_length=16)


@api_view(["POST"])
@permission_classes([AllowAny])
def session_exchange(request):
    """Exchange a one-time code for a session ID.

    The code was generated during the OIDC callback and stored in cache
    with a short TTL. This endpoint retrieves the session ID, deletes the
    code (single-use), and returns the session ID to the native app.
    """
    serializer = SessionExchangeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    code = serializer.validated_data["code"]
    cache_key = f"{EXCHANGE_CODE_PREFIX}{code}"

    session_key = cache.get(cache_key)
    if session_key is None:
        return Response(
            {"detail": "Invalid or expired code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Delete immediately — single use
    cache.delete(cache_key)

    cookie_name = getattr(settings, "SESSION_COOKIE_NAME", "sessionid")

    return Response({cookie_name: session_key})
