"""Authentication using LiveKit token for the Meet core app."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import ValidationError as DjangoValidationError

from livekit.api import TokenVerifier
from rest_framework import authentication, exceptions

UserModel = get_user_model()


class LiveKitTokenAuthentication(authentication.BaseAuthentication):
    """Authenticate using LiveKit token and load the associated Django user."""

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return None  # No authentication attempted

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise exceptions.AuthenticationFailed(
                "Authorization header must be: Bearer <token>"
            )

        token = parts[1]

        try:
            verifier = TokenVerifier(
                api_key=settings.LIVEKIT_CONFIGURATION["api_key"],
                api_secret=settings.LIVEKIT_CONFIGURATION["api_secret"],
            )
            claims = verifier.verify(token)

            user_id = claims.identity
            if not user_id:
                raise exceptions.AuthenticationFailed("Token missing user identity")

            return (self._user_of(claims), claims)

        except Exception as e:
            raise exceptions.AuthenticationFailed(
                f"Invalid LiveKit token: {str(e)}"
            ) from e

    @staticmethod
    def _user_of(claims):
        """The user of the token: by its `user_id` attribute when the identity was
        imposed by the caller (the external API mints `user:device` identities
        for MatrixRTC, and a provisioned user has no `sub`), else by `sub`."""
        attributes = getattr(claims, "attributes", None) or {}
        pk = attributes.get("user_id")
        if pk:
            try:
                return UserModel.objects.get(pk=pk)
            except (UserModel.DoesNotExist, ValueError, DjangoValidationError):
                pass
        try:
            return UserModel.objects.get(sub=claims.identity)
        except UserModel.DoesNotExist:
            return AnonymousUser()
