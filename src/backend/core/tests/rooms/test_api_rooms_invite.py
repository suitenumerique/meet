"""
Test rooms API endpoints in the Meet core app: invite.
"""

# pylint: disable=redefined-outer-name,unused-argument

import json
import random
from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...services.invitation import InvitationError, InvitationService

pytestmark = pytest.mark.django_db


def test_api_rooms_invite_anonymous():
    """Test anonymous users should not be allowed to invite people to rooms."""

    client = APIClient()
    room = RoomFactory()

    data = {"emails": ["toto@yopmail.com"]}
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/invite/",
        json.dumps(data),
        content_type="application/json",
    )

    assert response.status_code == 401


def test_api_rooms_invite_no_access():
    """Test non-privileged users should not be allowed to invite people to rooms."""

    client = APIClient()
    room = RoomFactory()

    user = UserFactory()
    client.force_login(user)

    data = {"emails": ["toto@yopmail.com"]}
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/invite/",
        json.dumps(data),
        content_type="application/json",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "You must have privileges on room to perform this action.",
    }


def test_api_rooms_invite_member():
    """Test member users should not be allowed to invite people to rooms."""

    client = APIClient()
    room = RoomFactory()

    user = UserFactory()
    client.force_login(user)

    room.accesses.create(user=user, role="member")

    data = {"emails": ["toto@yopmail.com"]}
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/invite/",
        json.dumps(data),
        content_type="application/json",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "You must have privileges on room to perform this action.",
    }


def test_api_rooms_invite_missing_emails():
    """Test missing email list should return validation error."""

    client = APIClient()
    room = RoomFactory()
    user = UserFactory()

    room.accesses.create(user=user, role=random.choice(["administrator", "owner"]))

    client.force_login(user)

    data = {"foo": []}
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/invite/",
        json.dumps(data),
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "emails": [
            "This field is required.",
        ]
    }


def test_api_rooms_invite_empty_emails():
    """Test empty email list should return validation error."""

    client = APIClient()
    room = RoomFactory()
    user = UserFactory()

    room.accesses.create(user=user, role=random.choice(["administrator", "owner"]))

    client.force_login(user)

    data = {"emails": []}
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/invite/",
        json.dumps(data),
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "emails": [
            "This list may not be empty.",
        ]
    }


def test_api_rooms_invite_invalid_emails():
    """Test invalid email addresses should return validation errors."""

    client = APIClient()
    room = RoomFactory()
    user = UserFactory()

    room.accesses.create(user=user, role=random.choice(["administrator", "owner"]))

    client.force_login(user)

    data = {"emails": ["abdc", "efg"]}

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/invite/",
        json.dumps(data),
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "emails": {
            "0": ["Enter a valid email address."],
            "1": ["Enter a valid email address."],
        }
    }


def test_api_rooms_invite_partially_invalid_emails():
    """Test partially invalid email addresses should return validation errors."""

    client = APIClient()
    room = RoomFactory()
    user = UserFactory()

    room.accesses.create(user=user, role=random.choice(["administrator", "owner"]))

    client.force_login(user)

    data = {"emails": ["fabrice@yopmail.com", "efg"]}

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/invite/",
        json.dumps(data),
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "emails": {
            "1": ["Enter a valid email address."],
        }
    }


@mock.patch.object(InvitationService, "invite_to_room")
def test_api_rooms_invite_duplicates(mock_invite_to_room):
    """Test duplicate emails should be deduplicated before processing."""

    client = APIClient()
    room = RoomFactory()
    user = UserFactory()

    room.accesses.create(user=user, role=random.choice(["administrator", "owner"]))

    client.force_login(user)

    data = {"emails": ["toto@yopmail.com", "toto@yopmail.com", "Toto@yopmail.com"]}

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/invite/",
        json.dumps(data),
        content_type="application/json",
    )

    assert response.status_code == 200
    mock_invite_to_room.assert_called_once()

    _, kwargs = mock_invite_to_room.call_args

    assert kwargs["room"] == room
    assert kwargs["sender"] == user
    assert sorted(kwargs["emails"]) == sorted(["Toto@yopmail.com", "toto@yopmail.com"])


@mock.patch.object(InvitationService, "invite_to_room", side_effect=InvitationError())
def test_api_rooms_invite_error(mock_invite_to_room):
    """Test invitation service error should return appropriate error response."""

    client = APIClient()
    room = RoomFactory()
    user = UserFactory()

    room.accesses.create(user=user, role=random.choice(["administrator", "owner"]))

    client.force_login(user)

    data = {"emails": ["toto@yopmail.com", "toto@yopmail.com"]}

    with pytest.raises(InvitationError):
        client.post(
            f"/api/v1.0/rooms/{room.id}/invite/",
            json.dumps(data),
            content_type="application/json",
        )

    mock_invite_to_room.assert_called_once()


@mock.patch("core.services.invitation.EmailMultiAlternatives")
def test_api_rooms_invite_success(mock_email_class, settings):
    """Test privileged users should successfully send invitation emails."""
    settings.EMAIL_BRAND_NAME = "ACME"
    settings.EMAIL_LOGO_IMG = "https://acme.com/logo"
    settings.EMAIL_APP_BASE_URL = "https://acme.com"
    settings.EMAIL_FROM = "notifications@acme.com"
    settings.EMAIL_DOMAIN = "acme.com"

    client = APIClient()
    room = RoomFactory()
    user = UserFactory()

    room.accesses.create(user=user, role=random.choice(["administrator", "owner"]))
    client.force_login(user)

    data = {"emails": ["fabien@yopmail.com", "gerald@yopmail.com"]}

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/invite/",
        json.dumps(data),
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success", "message": "invitations sent"}

    mock_email_class.assert_called_once()

    # Check constructor arguments
    call_kwargs = mock_email_class.call_args[1]  # EmailMultiAlternatives(**kwargs)

    assert call_kwargs["subject"] == (
        f"Video call in progress: {user.email} is waiting for you to connect"
    )
    assert call_kwargs["from_email"] == "notifications@acme.com"
    assert call_kwargs["to"] == []
    assert sorted(call_kwargs["bcc"]) == sorted(
        ["fabien@yopmail.com", "gerald@yopmail.com"]
    )

    # Check plain text body
    plain_body = call_kwargs["body"]
    required_content = [
        "ACME",
        "https://acme.com/logo",
        f"https://acme.com/{room.slug}",
        f"acme.com/{room.slug}",
    ]
    for content in required_content:
        assert content in plain_body

    # Check HTML alternative was attached
    mock_instance = mock_email_class.return_value
    mock_instance.attach_alternative.assert_called_once()
    html_body, mimetype = mock_instance.attach_alternative.call_args[0]
    assert mimetype == "text/html"
    for content in required_content:
        assert content in html_body

    # Check send was called
    mock_instance.send.assert_called_once()
