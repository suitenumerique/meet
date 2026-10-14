"""Shared helpers for tests in the Meet core application"""

from datetime import datetime, timedelta, timezone

from django.conf import settings

import jwt

from core.factories import ApplicationFactory
from core.models import ApplicationScope


def generate_user_access_token(user, application=None, **overrides):
    """Generate a valid user access JWT signed with the token secret.

    Claims can be overridden through keyword arguments; passing None for a
    claim removes it from the payload.
    """
    now = datetime.now(timezone.utc)

    if application is None:
        application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])

    payload = {
        "iss": settings.USER_ACCESS_TOKEN_ISSUER,
        "aud": settings.USER_ACCESS_TOKEN_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(seconds=settings.USER_ACCESS_TOKEN_TTL),
        "user_id": str(user.id),
        "token_type": settings.USER_ACCESS_TOKEN_TYPE_CLAIM,
        "client_id": application.client_id,
        "scope": "user:access",
    }
    payload.update(overrides)
    payload = {key: value for key, value in payload.items() if value is not None}

    return jwt.encode(
        payload,
        settings.USER_ACCESS_TOKEN_SECRET_KEY,
        algorithm=settings.USER_ACCESS_TOKEN_ALG,
    )
