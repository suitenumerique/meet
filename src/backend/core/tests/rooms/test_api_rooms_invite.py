"""
Test rooms API endpoints in the Meet core app: invite.
"""

# pylint: disable=W0621,W0613

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

    with pytest.raises(InvitationError) as excinfo:
        client.post(
            f"/api/v1.0/rooms/{room.id}/invite/",
            json.dumps(data),
            content_type="application/json",
        )

        mock_invite_to_room.assert_called_once()
        assert "Could not send invitation" in str(excinfo.value)


@mock.patch("core.services.invitation.send_mail")
def test_api_rooms_invite_success(mock_send_mail, settings):
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

    mock_send_mail.assert_called_once()

    subject, body, sender, recipients = mock_send_mail.call_args[0]

    assert (
        subject == f"Video call in progress: {user.email} is waiting for you to connect"
    )

    # Verify email contains expected content
    required_content = [
        "ACME",  # Brand name
        "https://acme.com/logo",  # Logo URL
        f"https://acme.com/{room.slug}",  # Room url
        f"acme.com/{room.slug}",  # Room link
    ]

    for content in required_content:
        assert content in body

    assert sender == "notifications@acme.com"

    # Verify all owners received the email (order-independent comparison)
    assert sorted(recipients) == sorted(["fabien@yopmail.com", "gerald@yopmail.com"])
