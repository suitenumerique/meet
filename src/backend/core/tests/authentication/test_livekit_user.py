"""
Tests of the user LiveKitTokenAuthentication resolves.
"""

from unittest import mock

from django.conf import settings
from django.contrib.auth.models import AnonymousUser

import jwt
import pytest
from livekit.api import AccessToken, TokenVerifier, VideoGrants
from rest_framework.test import APIClient, APIRequestFactory

from core import utils
from core.authentication.livekit import LiveKitTokenAuthentication
from core.factories import RoomFactory, UserFactory
from core.models import RoomAccessLevel
from core.utils import generate_token

pytestmark = pytest.mark.django_db


def livekit_token(identity, attributes=None, room="room"):
    """A LiveKit token of the test configuration."""
    token = (
        AccessToken(
            api_key=settings.LIVEKIT_CONFIGURATION["api_key"],
            api_secret=settings.LIVEKIT_CONFIGURATION["api_secret"],
        )
        .with_grants(VideoGrants(room=room, room_join=True))
        .with_identity(identity)
    )
    if attributes:
        token = token.with_attributes(attributes)
    return token.to_jwt()


def attributes_of(token):
    """The attributes Meet set in a token."""
    return (
        TokenVerifier(
            api_key=settings.LIVEKIT_CONFIGURATION["api_key"],
            api_secret=settings.LIVEKIT_CONFIGURATION["api_secret"],
        )
        .verify(token)
        .attributes
    )


def authenticate(token):
    """The (user, claims) the authentication gives for the token."""
    request = APIRequestFactory().post(
        "/", HTTP_AUTHORIZATION=f"X-LiveKit-Token {token}", format="json"
    )
    return LiveKitTokenAuthentication().authenticate(request)


def test_user_of_a_token_meet_minted_for_them():
    """A token Meet minted for a user names that user."""
    alice = UserFactory(sub="alice-sub")

    user, claims = authenticate(generate_token(room="room", user=alice))

    assert claims.identity == "alice-sub"
    assert user == alice


def test_user_behind_an_imposed_identity():
    """An imposed identity (`user:device`) names nobody: the `user_id`
    attribute does, even for a user without a sub."""
    alice = UserFactory(sub=None)

    user, claims = authenticate(
        generate_token(room="room", user=alice, identity="@alice:localhost:DEVICE")
    )

    assert claims.identity == "@alice:localhost:DEVICE"
    assert user == alice


def test_no_user_for_an_anonymous_participant_with_the_sub_of_a_user():
    """The identity of an anonymous participant comes from the client: being
    equal to the sub of a user does not make the token theirs."""
    UserFactory(sub="alice-sub")

    user, claims = authenticate(
        generate_token(room="room", user=AnonymousUser(), participant_id="alice-sub")
    )

    assert claims.identity == "alice-sub"
    assert user.is_anonymous


def test_no_user_by_the_identity_alone():
    """A token without the attributes of Meet names nobody, whatever its
    identity."""
    UserFactory(sub="alice-sub")

    user, _ = authenticate(livekit_token("alice-sub"))

    assert user.is_anonymous


def test_no_user_by_the_attribute_without_its_proof():
    """A `user_id` attribute without the proof of Meet names nobody."""
    alice = UserFactory(sub="alice-sub")

    user, _ = authenticate(livekit_token("alice-sub", {"user_id": str(alice.pk)}))

    assert user.is_anonymous


def test_no_user_by_another_user_id_than_the_proven_one():
    """The proof holds for one user: another `user_id` beside it names nobody."""
    alice = UserFactory(sub="alice-sub")
    bob = UserFactory(sub="bob-sub")
    attributes = {
        **attributes_of(generate_token(room="room", user=alice)),
        "user_id": str(bob.pk),
    }

    user, _ = authenticate(livekit_token("alice-sub", attributes))

    assert user.is_anonymous


def test_no_user_by_the_attributes_of_another_identity_or_room():
    """The proof holds for the identity and room it was set for."""
    alice = UserFactory(sub="alice-sub")
    attributes = attributes_of(generate_token(room="room", user=alice))

    other_identity, _ = authenticate(livekit_token("bob-sub", attributes))
    other_room, _ = authenticate(livekit_token("alice-sub", attributes, room="other"))

    assert other_identity.is_anonymous
    assert other_room.is_anonymous


def test_anonymous_when_nothing_matches():
    """An unknown identity and no usable attribute: anonymous."""
    user, _ = authenticate(livekit_token("nobody", {"user_id": "not-a-uuid"}))

    assert user.is_anonymous


def test_no_user_for_a_disabled_account():
    """A token minted before the account was disabled names nobody."""
    alice = UserFactory(sub="alice-sub")
    token = generate_token(room="room", user=alice)
    alice.is_active = False
    alice.save()

    user, _ = authenticate(token)

    assert user.is_anonymous


def test_request_entry_authenticated_user_keeps_its_sub_as_identity():
    """The LiveKit identity of a signed in user is its sub, not the lobby id:
    the roles of the participants are found by it."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    with mock.patch.object(utils, "notify_participants", return_value=None):
        response = client.post(
            f"/api/v1.0/rooms/{room.id}/request-entry/",
            {"username": "test_user"},
        )

    assert response.status_code == 200
    claims = jwt.decode(
        response.json()["livekit"]["token"],
        settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
    )
    assert claims["sub"] == str(user.sub)
    assert claims["sub"] != response.json()["id"]
    assert claims["attributes"]["user_id"] == str(user.pk)
