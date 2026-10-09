"""
Tests for external API /rooms/{id}/livekit-token endpoint (MatrixRTC token services)
"""

# pylint: disable=W0621

from django.conf import settings

import jwt
import pytest
from rest_framework.test import APIClient

from core.factories import RoomFactory, UserFactory
from core.models import ApplicationScope, RoleChoices

from .test_external_api_rooms import generate_test_token

pytestmark = pytest.mark.django_db


def decode(token):
    """The claims of a LiveKit token of the test configuration."""
    return jwt.decode(
        token,
        settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
        options={"verify_aud": False},
    )


def mint(user, room, body, scopes=(ApplicationScope.ROOMS_RETRIEVE,)):
    """Ask a token for `user` in `room` as an application."""
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {generate_test_token(user, list(scopes))}"
    )
    return client.post(
        f"/external-api/v1.0/rooms/{room.id}/livekit-token/", body, format="json"
    )


def test_livekit_token_uses_the_identity_the_application_imposes(settings):
    """The identity is the one of the request, not the sub of the user; the user
    is carried by the attributes, with the Matrix ids."""
    settings.LIVEKIT_CONFIGURATION = {
        **settings.LIVEKIT_CONFIGURATION,
        "url": "http://synapse:7880",
    }
    owner = UserFactory()
    room = RoomFactory(users=[(owner, RoleChoices.OWNER)])
    alice = UserFactory(sub="alice-sub")

    response = mint(
        alice,
        room,
        {
            "identity": "@alice:localhost:DEVICE",
            "username": "Alice",
            "role": "administrator",
        },
    )

    assert response.status_code == 200
    assert response.json()["url"] == "http://synapse:7880"
    assert response.json()["room"] == str(room.id)
    claims = decode(response.json()["token"])
    assert claims["sub"] == "@alice:localhost:DEVICE"
    assert claims["name"] == "Alice"
    assert claims["video"]["room"] == str(room.id)
    assert claims["video"]["roomAdmin"] is True
    assert claims["attributes"]["user_id"] == str(alice.pk)
    assert claims["attributes"]["matrix_user_id"] == "@alice:localhost"
    assert claims["attributes"]["matrix_device_id"] == "DEVICE"
    assert claims["attributes"]["room_role"] == "administrator"


def test_livekit_token_needs_no_role_on_the_room():
    """The application vouches for the user: no ResourceAccess needed."""
    room = RoomFactory()
    alice = UserFactory()

    response = mint(alice, room, {"identity": "@alice:localhost:DEVICE"})

    assert response.status_code == 200
    assert decode(response.json()["token"])["video"]["roomAdmin"] is False


def test_livekit_token_one_user_two_devices_two_identities():
    """The same user from two devices gets two identities: LiveKit keeps both."""
    room = RoomFactory()
    alice = UserFactory()

    first = mint(alice, room, {"identity": "@alice:localhost:A"})
    second = mint(alice, room, {"identity": "@alice:localhost:B"})

    assert decode(first.json()["token"])["sub"] == "@alice:localhost:A"
    assert decode(second.json()["token"])["sub"] == "@alice:localhost:B"


def test_livekit_token_sets_the_sub_of_a_provisioned_user():
    """A user provisioned by email has no sub: the application gives it, once."""
    room = RoomFactory()
    alice = UserFactory(sub=None)

    mint(alice, room, {"identity": "@alice:localhost:A", "sub": "alice-oidc"})
    alice.refresh_from_db()
    assert alice.sub == "alice-oidc"

    mint(alice, room, {"identity": "@alice:localhost:A", "sub": "another"})
    alice.refresh_from_db()
    assert alice.sub == "alice-oidc"


def test_livekit_token_requires_the_scope_and_an_identity():
    """Without rooms:retrieve, 403; without identity, 400."""
    room = RoomFactory()
    alice = UserFactory()

    without_scope = mint(
        alice,
        room,
        {"identity": "@alice:localhost:A"},
        scopes=(ApplicationScope.ROOMS_LIST,),
    )
    without_identity = mint(alice, room, {})

    assert without_scope.status_code == 403
    assert without_identity.status_code == 400


def test_livekit_token_unknown_room():
    """A room that does not exist: 404."""
    alice = UserFactory()
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {generate_test_token(alice, [ApplicationScope.ROOMS_RETRIEVE])}"
    )

    response = client.post(
        "/external-api/v1.0/rooms/00000000-0000-0000-0000-000000000000/livekit-token/",
        {"identity": "@alice:localhost:A"},
        format="json",
    )

    assert response.status_code == 404
