"""Authentication using LiveKit token for the Meet core app."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser

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

            try:
                user = UserModel.objects.get(sub=user_id)
            except UserModel.DoesNotExist:
                user = AnonymousUser()

            return (user, claims)

        except Exception as e:
            raise exceptions.AuthenticationFailed(
                f"Invalid LiveKit token: {str(e)}"
            ) from e
