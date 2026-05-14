"""Webhooks authentication."""

import logging

from django.conf import settings
from django.contrib.auth.models import AnonymousUser

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

logger = logging.getLogger(__name__)


class AiWebhookAuthentication(BaseAuthentication):
    """
    Custom authentication class for AI webhook requests.
    Validates the API key in the Authorization header.
    """

    def authenticate(self, request):
        """
        Authenticate the request and return a two-tuple of (user, token).
        """

        authorization_header: str = request.headers.get("Authorization") or ""
        if authorization_header.removeprefix("Bearer ") != settings.AI_WEBHOOK_API_KEY:
            logger.warning(
                "Authentication failed: Bad Authorization header (ip: %s)",
                request.META.get("REMOTE_ADDR"),
            )
            raise AuthenticationFailed()

        # No users are associated with the transcribe webhooks
        return AnonymousUser(), None
