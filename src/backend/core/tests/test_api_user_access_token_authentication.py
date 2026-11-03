"""
Tests for user access JWT authentication on the core API.

The token authenticates the user on the whole API, exactly like a session
cookie would (similar to lib-jitsi-meet's token authentication): the
existing role-based permissions apply unchanged. Room endpoint coverage
with a user access token lives in the room test files.
"""

from datetime import datetime, timedelta, timezone

from django.conf import settings as django_settings

import jwt
import pytest
from rest_framework.test import APIClient

from core.audit.testing import find_events
from core.factories import (
    ApplicationFactory,
    RecordingFactory,
    RoomFactory,
    UserFactory,
    UserRecordingAccessFactory,
)
from core.models import ApplicationScope, RoleChoices
from core.tests.utils import generate_user_access_token

pytestmark = pytest.mark.django_db


def test_user_access_token_users_me():
    """A user access token should authenticate the user on /users/me/."""
    user = UserFactory()

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_user_access_token(user)}")

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 200
    assert response.data["email"] == user.email


def test_user_access_token_custom_token_type(settings):
    """The Authorization scheme should match the configured token type."""
    settings.USER_ACCESS_TOKEN_TYPE = "Token"
    user = UserFactory()

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {generate_user_access_token(user)}")

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 200
    assert response.data["email"] == user.email


def test_user_access_token_expired():
    """An expired user access token should be rejected."""
    user = UserFactory()

    now = datetime.now(timezone.utc)
    token = generate_user_access_token(
        user,
        iat=now - timedelta(hours=3),
        exp=now - timedelta(hours=1),
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 401
    assert "token expired" in str(response.data).lower()


def test_user_access_token_wrong_token_type():
    """A verified token with the wrong 'token_type' claim should be rejected."""
    user = UserFactory()

    token = generate_user_access_token(user, token_type="addons")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 401
    assert "invalid token type" in str(response.data).lower()


def test_user_access_token_invalid_signature():
    """A token signed with the wrong key should defer and end unauthenticated."""
    user = UserFactory()

    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "iss": django_settings.USER_ACCESS_TOKEN_ISSUER,
            "aud": django_settings.USER_ACCESS_TOKEN_AUDIENCE,
            "iat": now,
            "exp": now + timedelta(seconds=600),
            "user_id": str(user.id),
            "token_type": "user_token",
            "client_id": "test-app",
        },
        "wrong-secret-key-padded-for-minimum-len!",
        algorithm=django_settings.USER_ACCESS_TOKEN_ALG,
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    # UserAccessJWTAuthentication defers, session auth finds no session
    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 401


def test_user_access_token_missing_client_id_claim():
    """A token without the issuance-audit claim should be rejected."""
    user = UserFactory()

    token = generate_user_access_token(user, client_id=None)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 401
    assert "invalid token claims" in str(response.data).lower()


def test_user_access_token_inactive_user():
    """A user access token for an inactive user should be rejected."""
    user = UserFactory(is_active=False)

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_user_access_token(user)}")

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 401


def test_user_access_token_feature_disabled(settings):
    """When the feature is disabled, user access tokens should be ignored."""
    settings.USER_ACCESS_TOKEN_ENABLED = False

    user = UserFactory()

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_user_access_token(user)}")

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 401


def test_user_access_token_does_not_break_session_authentication():
    """A session-authenticated user should keep full access to the API."""
    user = UserFactory()
    RoomFactory(users=[(user, RoleChoices.OWNER)])

    client = APIClient()
    client.force_login(user)
    response = client.get("/api/v1.0/rooms/")

    assert response.status_code == 200
    assert response.data["count"] == 1


def test_user_access_token_application_jwt_not_accepted_on_core_api():
    """An application-delegation JWT must not authenticate on the core API."""
    user = UserFactory()

    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "iss": django_settings.APPLICATION_JWT_ISSUER,
            "aud": django_settings.APPLICATION_JWT_AUDIENCE,
            "iat": now,
            "exp": now + timedelta(seconds=600),
            "user_id": str(user.id),
            "client_id": "some-client",
            "delegated": True,
            "scope": "rooms:retrieve",
        },
        django_settings.APPLICATION_JWT_SECRET_KEY,
        algorithm=django_settings.APPLICATION_JWT_ALG,
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    # The user token backend must defer (wrong signature) and the request
    # must end up unauthenticated.
    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 401


def test_user_access_token_application_scope_revoked():
    """Revoking the application's grant invalidates its outstanding tokens."""
    user = UserFactory()
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])

    token = generate_user_access_token(user, application=application)

    application.scopes = []
    application.save()

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 401
    assert "application access revoked" in str(response.data).lower()


def test_user_access_token_application_deactivated():
    """Deactivating the application invalidates its outstanding tokens."""
    user = UserFactory()
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])

    token = generate_user_access_token(user, application=application)

    application.is_active = False
    application.save()

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 401
    assert "application access revoked" in str(response.data).lower()


def test_user_access_token_unknown_application():
    """A token whose client_id matches no application is refused."""
    user = UserFactory()

    token = generate_user_access_token(user, client_id="not-an-application")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 401
    assert "application access revoked" in str(response.data).lower()


def test_user_access_token_does_not_override_existing_session():
    """A Bearer token must not override the identity of a live session."""
    session_user = UserFactory()
    token_user = UserFactory()

    client = APIClient()
    client.force_login(session_user)
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {generate_user_access_token(token_user)}"
    )

    response = client.get("/api/v1.0/users/me/")

    assert response.status_code == 200
    assert response.data["email"] == session_user.email


def test_user_access_token_actions_are_audited_through_the_application(
    audit_events,
):
    """The application the token was delegated by acts, for the person it names."""
    user = UserFactory(email="jean-neige@winterfell.com")
    application = ApplicationFactory(scopes=[ApplicationScope.USERS_SESSION])
    recording = RecordingFactory(status="saved")
    UserRecordingAccessFactory(role="owner", user=user, recording=recording)

    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=(
            f"Bearer {generate_user_access_token(user, application=application)}"
        )
    )

    response = client.delete(f"/api/v1.0/recordings/{recording.id}/")

    assert response.status_code == 204

    [event] = find_events(audit_events, "recording.delete")

    assert event["lasuite"]["actor"] == {"type": "application", "sub": user.sub}
    assert event["lasuite"]["auth"] == {"method": "user_access_jwt"}
    assert event["lasuite"]["application"] == {"client_id": application.client_id}
    assert event["user"] == {"id": str(user.pk), "domain": "winterfell.com"}
    assert event["organization"] == {"id": application.client_id}
