"""Tests for the audit of Django's authentication signals."""

import json

from django.contrib.auth import authenticate, login
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpResponse
from django.test import RequestFactory

import pytest

from core import audit
from core.audit.testing import find_events
from core.factories import UserFactory

pytestmark = pytest.mark.django_db


def _request_with_session(method="get"):
    request = getattr(RequestFactory(), method)("/", REMOTE_ADDR="1.2.3.4")
    SessionMiddleware(lambda req: HttpResponse())(request)
    return request


def test_login_is_audited(audit_events, client):
    """A login records the user, the mechanism and the backend."""
    user = UserFactory(email="user@example.com")

    client.force_login(user)

    [event] = find_events(audit_events, "user.login")

    assert event["event"]["category"] == ["authentication"]
    assert event["event"]["type"] == ["start"]
    assert event["event"]["outcome"] == "success"
    assert event["user"] == {"id": str(user.pk), "domain": "example.com"}
    assert event["lasuite"]["actor"] == {"type": "user", "sub": user.sub}
    assert event["lasuite"]["auth"] == {"method": "password"}
    assert event["lasuite"]["details"]["auth_backend"].endswith("ModelBackend")


def test_login_through_oidc_backend_is_named_oidc(audit_events):
    """The OIDC backend is reported as the ``oidc`` auth method."""
    user = UserFactory()
    user.backend = "core.authentication.backends.OIDCAuthenticationBackend"
    request = _request_with_session()

    login(request, user)

    [event] = find_events(audit_events, "user.login")

    assert event["lasuite"]["auth"] == {"method": "oidc"}
    assert event["client"] == {"ip": "1.2.3.4"}
    assert event["lasuite"]["details"]["auth_backend"] == user.backend


def test_login_given_its_backend_is_named_after_it(audit_events):
    """A backend passed to ``login`` rather than set by ``authenticate`` counts."""
    backend = "core.authentication.backends.OIDCAuthenticationBackend"

    login(_request_with_session(), UserFactory(), backend=backend)

    [event] = find_events(audit_events, "user.login")

    assert event["lasuite"]["auth"] == {"method": "oidc"}
    assert event["lasuite"]["details"]["auth_backend"] == backend


def test_login_through_an_unlisted_backend_is_unknown(audit_events):
    """A backend missing from the setting is unknown, even a ModelBackend subclass."""
    user = UserFactory()
    user.backend = "django.contrib.auth.backends.RemoteUserBackend"

    login(_request_with_session(), user)

    [event] = find_events(audit_events, "user.login")

    assert event["lasuite"]["auth"] == {"method": "unknown"}
    assert event["lasuite"]["details"]["auth_backend"] == user.backend


def test_failed_login_is_audited_without_credentials(audit_events):
    """A failed login is a warning that never contains the credentials."""
    request = _request_with_session("post")

    assert authenticate(request=request, username="nobody", password="s3cret") is None

    [event] = find_events(audit_events, "user.login")

    assert event["event"]["outcome"] == "failure"
    assert event["event"]["type"] == ["start"]
    assert event["event"]["reason"] == "authentication_failed"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["actor"] == {"type": "anonymous"}
    assert event["lasuite"]["auth"] == {"method": "password"}
    assert event["log"]["level"] == "warning"
    assert "s3cret" not in json.dumps(event)
    assert "nobody" not in json.dumps(event)


def test_failed_login_in_a_signed_in_session_is_anonymous(audit_events):
    """A failed login never records the account the session is signed in as."""
    request = _request_with_session("post")
    request.user = UserFactory(email="signed-in@example.com")

    assert authenticate(request=request, username="nobody", password="s3cret") is None

    [event] = find_events(audit_events, "user.login")

    assert event["lasuite"]["actor"] == {"type": "anonymous"}
    assert "user" not in event
    assert "organization" not in event
    assert "example.com" not in json.dumps(event)


def test_failed_login_without_request_is_anonymous(audit_events):
    """A failed login is anonymous even when no request is at hand."""
    assert authenticate(username="nobody", password="s3cret") is None

    [event] = find_events(audit_events, "user.login")

    assert event["event"]["outcome"] == "failure"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["actor"] == {"type": "anonymous"}
    assert event["lasuite"]["auth"] == {"method": "password"}


@pytest.mark.parametrize(
    "credentials,method",
    [
        # What the OIDC callback hands to ``authenticate``.
        ({"nonce": "n-0nce", "code_verifier": "v3rifier"}, "oidc"),
        ({"token": "t0ken"}, "unknown"),
    ],
)
def test_failed_login_is_named_after_its_credentials(audit_events, credentials, method):
    """A failed attempt is named after what it submitted, never recording it."""
    request = _request_with_session()

    assert authenticate(request=request, **credentials) is None

    [event] = find_events(audit_events, "user.login")

    assert event["event"]["outcome"] == "failure"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["auth"] == {"method": method}
    for value in credentials.values():
        assert value not in json.dumps(event)


def test_logout_is_audited(audit_events, client):
    """A logout records the user who left."""
    user = UserFactory()
    client.force_login(user)

    client.logout()

    [event] = find_events(audit_events, "user.logout")

    assert event["event"]["type"] == ["end"]
    assert event["user"]["id"] == str(user.pk)


def test_logout_without_a_signed_in_user_is_not_audited(audit_events, client):
    """Django signals a logout without a user when no one was signed in."""
    client.logout()

    assert find_events(audit_events, "user.logout") == []


def test_connect_auth_signals_is_idempotent(audit_events, client):
    """Connecting twice does not duplicate events."""
    audit.connect_auth_signals()
    audit.connect_auth_signals()
    user = UserFactory()

    client.force_login(user)

    assert len(find_events(audit_events, "user.login")) == 1
