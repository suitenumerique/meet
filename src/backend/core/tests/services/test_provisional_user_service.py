"""Test provisional user service."""

# pylint: disable=W0621,W0613

import json
from unittest import mock

from django.db import IntegrityError

import pytest

from core.audit.testing import find_events
from core.factories import UserFactory
from core.models import User
from core.services.provisional_user_service import (
    ProvisionalUserIntegrityError,
    ProvisionalUserService,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def allow_provisioning(settings):
    """Enable provisional user creation."""
    settings.APPLICATION_ALLOW_USER_CREATION = True
    settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = True
    settings.OIDC_USER_SUB_FIELD_IMMUTABLE = False


def test_get_or_create_existing_user_is_not_audited(audit_events):
    """Finding an existing user provisions nothing, so it emits no event."""
    user = UserFactory(email="john.doe@example.com")

    assert ProvisionalUserService().get_or_create(
        "John.Doe@example.com", "my-client"
    ) == (user, False)
    assert not find_events(audit_events, "user.provision")


def test_get_or_create_creation_is_audited(audit_events):
    """A created user is identified by its id, without sub nor email."""
    user, created = ProvisionalUserService().get_or_create(
        "john.doe@example.com", "my-client"
    )

    assert created is True
    assert user.sub is None

    [event] = find_events(audit_events, "user.provision")

    assert event["log"] == {"level": "info"}
    assert event["event"]["outcome"] == "success"
    assert event["event"]["type"] == ["user", "creation"]
    assert event["lasuite"]["actor"] == {"type": "application"}
    assert event["lasuite"]["auth"] == {"method": "client_credentials"}
    assert event["lasuite"]["application"] == {"client_id": "my-client"}
    # A provisional user has no sub yet
    assert event["entity"]["target"] == {
        "id": str(user.pk),
        "type": ["user"],
        "sub_type": "user",
    }
    assert event["user"] == {"target": {"id": str(user.pk), "domain": "example.com"}}
    assert "john.doe" not in json.dumps(event)


@mock.patch.object(ProvisionalUserService, "_get_by_email")
def test_get_or_create_lost_race_is_audited_with_the_existing_user(
    mock_get_by_email, audit_events
):
    """A lost race reports the user the concurrent request created."""
    existing_user = UserFactory(sub=None, email="john.doe@example.com")
    mock_get_by_email.side_effect = [None, existing_user]

    assert ProvisionalUserService().get_or_create(
        "john.doe@example.com", "my-client"
    ) == (existing_user, False)
    assert User.objects.filter(email="john.doe@example.com").count() == 1

    [event] = find_events(audit_events, "user.provision")

    assert event["log"] == {"level": "warning"}
    assert event["event"]["outcome"] == "failure"
    assert event["event"]["reason"] == "conflict"
    assert event["error"] == {"type": "django.core.exceptions.ValidationError"}
    assert event["lasuite"]["application"] == {"client_id": "my-client"}
    assert event["entity"]["target"] == {
        "id": str(existing_user.pk),
        "type": ["user"],
        "sub_type": "user",
    }
    assert event["user"] == {
        "target": {"id": str(existing_user.pk), "domain": "example.com"}
    }
    assert "john.doe" not in json.dumps(event)


@mock.patch.object(User, "save", side_effect=IntegrityError)
@mock.patch.object(ProvisionalUserService, "_get_by_email", return_value=None)
def test_get_or_create_unrecoverable_conflict_is_audited(
    mock_get_by_email, mock_save, audit_events
):
    """A conflict without any user to fall back on is audited without target."""
    with pytest.raises(ProvisionalUserIntegrityError):
        ProvisionalUserService().get_or_create("john.doe@example.com", "my-client")

    [event] = find_events(audit_events, "user.provision")

    assert event["event"]["outcome"] == "failure"
    assert event["event"]["reason"] == "conflict"
    assert event["error"] == {"type": "django.db.utils.IntegrityError"}
    assert "target" not in event["lasuite"]
