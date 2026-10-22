"""
Tests for external API /rooms/{id}/livekit-token endpoint
"""

# pylint: disable=W0621

from datetime import datetime, timedelta, timezone
from unittest import mock

from django.conf import settings

import jwt
import pytest
from lasuite.oidc_resource_server.authentication import ResourceServerAuthentication
from rest_framework.test import APIClient

from core.audit.testing import find_events
from core.factories import ApplicationFactory, RoomFactory, UserFactory
from core.models import ApplicationScope, RoleChoices
from core.utils import user_id_proof

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def application():
    """The application that asks: the rooms of these tests are its own."""
    return ApplicationFactory(client_id="tom")


def room_of_the_application(**kwargs):
    """A room the application created through the external API."""
    return RoomFactory(
        created_by_application=ApplicationFactory._meta.model.objects.get(
            client_id="tom"
        ),
        **kwargs,
    )


def application_token(user, scopes, client_id="tom"):
    """The token Meet gives an application for one of its users."""
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "iss": settings.APPLICATION_JWT_ISSUER,
            "aud": settings.APPLICATION_JWT_AUDIENCE,
            "iat": now,
            "exp": now + timedelta(seconds=60),
            "client_id": client_id,
            "scope": " ".join(scopes),
            "user_id": str(user.id),
            "delegated": True,
        },
        settings.APPLICATION_JWT_SECRET_KEY,
        algorithm=settings.APPLICATION_JWT_ALG,
    )


def decode(token):
    """The claims of a LiveKit token of the test configuration."""
    return jwt.decode(
        token,
        settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
        options={"verify_aud": False},
    )


def mint(user, room, body, scopes=(ApplicationScope.ROOMS_LIVEKIT_TOKEN,)):
    """Ask a token for `user` in `room` as an application."""
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {application_token(user, list(scopes))}"
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
    room = room_of_the_application(users=[(owner, RoleChoices.OWNER)])
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
    assert claims["attributes"]["user_id_proof"] == user_id_proof(
        str(room.id), "@alice:localhost:DEVICE", str(alice.pk)
    )
    assert claims["attributes"]["matrix_user_id"] == "@alice:localhost"
    assert claims["attributes"]["matrix_device_id"] == "DEVICE"
    assert claims["attributes"]["room_role"] == "administrator"


def test_livekit_token_needs_no_role_on_the_room():
    """The application vouches for the user: no ResourceAccess needed."""
    room = room_of_the_application()
    alice = UserFactory()

    response = mint(alice, room, {"identity": "@alice:localhost:DEVICE"})

    assert response.status_code == 200
    assert decode(response.json()["token"])["video"]["roomAdmin"] is False


def test_livekit_token_one_user_two_devices_two_identities():
    """The same user from two devices gets two identities: LiveKit keeps both."""
    room = room_of_the_application()
    alice = UserFactory()

    first = mint(alice, room, {"identity": "@alice:localhost:A"})
    second = mint(alice, room, {"identity": "@alice:localhost:B"})

    assert decode(first.json()["token"])["sub"] == "@alice:localhost:A"
    assert decode(second.json()["token"])["sub"] == "@alice:localhost:B"


def test_livekit_token_sets_the_sub_of_a_provisioned_user(audit_events):
    """A user provisioned by email has no sub: the application gives it, once,
    and the audit keeps it."""
    room = room_of_the_application()
    alice = UserFactory(sub=None)

    mint(alice, room, {"identity": "@alice:localhost:A", "sub": "alice-oidc"})
    alice.refresh_from_db()
    assert alice.sub == "alice-oidc"
    [event] = find_events(audit_events, "room.livekit_token")
    assert event["lasuite"]["details"]["sub_set"] is True

    mint(alice, room, {"identity": "@alice:localhost:A", "sub": "another"})
    alice.refresh_from_db()
    assert alice.sub == "alice-oidc"


def test_livekit_token_does_not_tell_that_a_sub_exists():
    """A sub another user has is not set, and the answer does not say so."""
    UserFactory(sub="taken")
    room = room_of_the_application()
    alice = UserFactory(sub=None)

    response = mint(alice, room, {"identity": "@alice:localhost:A", "sub": "taken"})

    assert response.status_code == 200
    assert set(response.json()) == {"url", "room", "token"}
    alice.refresh_from_db()
    assert alice.sub is None


def test_livekit_token_requires_its_own_scope():
    """rooms:retrieve reads a room: it mints no token."""
    room = room_of_the_application()
    alice = UserFactory()

    response = mint(
        alice,
        room,
        {"identity": "@alice:localhost:A"},
        scopes=(ApplicationScope.ROOMS_RETRIEVE, ApplicationScope.ROOMS_LIST),
    )

    assert response.status_code == 403


def test_livekit_token_refuses_the_oidc_token_of_a_user():
    """Applications only: a resource server token, which an end user holds,
    does not reach the route, whatever its scopes."""
    owner = UserFactory()
    room = room_of_the_application(users=[(owner, RoleChoices.OWNER)])
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer an-oidc-access-token")

    with mock.patch.object(
        ResourceServerAuthentication,
        "authenticate",
        return_value=(owner, "an-oidc-access-token"),
    ) as authenticate:
        response = client.post(
            f"/external-api/v1.0/rooms/{room.id}/livekit-token/",
            {"identity": "@owner:localhost:A", "role": "owner"},
            format="json",
        )

    assert response.status_code == 401
    authenticate.assert_not_called()


def test_livekit_token_refuses_an_addons_token():
    """Applications only: a token signed for the addons does not reach the route."""
    alice = UserFactory()
    room = room_of_the_application()
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "iss": settings.ADDONS_TOKEN_ISSUER,
            "aud": settings.ADDONS_TOKEN_AUDIENCE,
            "iat": now,
            "exp": now + timedelta(seconds=60),
            "scope": ApplicationScope.ROOMS_LIVEKIT_TOKEN,
            "user_id": str(alice.id),
        },
        settings.ADDONS_TOKEN_SECRET_KEY,
        algorithm=settings.ADDONS_TOKEN_ALG,
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.post(
        f"/external-api/v1.0/rooms/{room.id}/livekit-token/",
        {"identity": "@alice:localhost:A"},
        format="json",
    )

    assert response.status_code == 401


@pytest.mark.parametrize(
    "identity",
    ["", "alice", "@alice:localhost", "alice:localhost:DEVICE", "@alice:local host:A"],
)
def test_livekit_token_refuses_an_identity_of_another_shape(identity):
    """The identity is `@user:server:device`, nothing else."""
    room = room_of_the_application()
    alice = UserFactory()

    response = mint(alice, room, {"identity": identity})

    assert response.status_code == 400


def test_livekit_token_follows_the_sources_of_the_room():
    """A member publishes what the room allows; an administrator, everything."""
    room = room_of_the_application(
        configuration={"can_publish_sources": ["microphone"]}
    )
    alice = UserFactory()

    member = mint(alice, room, {"identity": "@alice:localhost:A"})
    administrator = mint(
        alice, room, {"identity": "@alice:localhost:A", "role": "administrator"}
    )

    assert decode(member.json()["token"])["video"]["canPublishSources"] == [
        "microphone"
    ]
    assert (
        decode(administrator.json()["token"])["video"]["canPublishSources"]
        == settings.LIVEKIT_DEFAULT_SOURCES
    )


def test_livekit_token_is_audited(audit_events):
    """The audit keeps who got a token, for which room, never the token."""
    room = room_of_the_application()
    alice = UserFactory()

    response = mint(alice, room, {"identity": "@alice:localhost:A", "role": "member"})

    [event] = find_events(audit_events, "room.livekit_token")
    assert event["event"]["outcome"] == "success"
    assert event["entity"]["target"]["id"] == str(room.pk)
    assert event["user"]["id"] == str(alice.pk)
    assert event["lasuite"]["details"] == {
        "identity": "@alice:localhost:A",
        "role": "member",
    }
    assert response.json()["token"] not in str(event)


def test_livekit_token_requires_an_identity():
    """Without identity, 400."""
    room = room_of_the_application()
    alice = UserFactory()

    assert mint(alice, room, {}).status_code == 400


def test_livekit_token_unknown_room():
    """A room that does not exist: 404."""
    alice = UserFactory()
    token = application_token(alice, [ApplicationScope.ROOMS_LIVEKIT_TOKEN])
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.post(
        "/external-api/v1.0/rooms/00000000-0000-0000-0000-000000000000/livekit-token/",
        {"identity": "@alice:localhost:A"},
        format="json",
    )

    assert response.status_code == 404


def test_livekit_token_only_for_the_rooms_of_the_application():
    """A room made in Meet, or by another application, does not exist for
    this one: its secret opens its own rooms only."""
    alice = UserFactory()
    made_in_meet = RoomFactory()
    of_another = RoomFactory(created_by_application=ApplicationFactory())

    for room in (made_in_meet, of_another):
        response = mint(alice, room, {"identity": "@alice:localhost:A"})
        assert response.status_code == 404


def test_room_created_by_an_application_keeps_it(application):
    """The external API remembers which application created a room."""
    owner = UserFactory()
    client = APIClient()
    token = application_token(owner, [ApplicationScope.ROOMS_CREATE])
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.post("/external-api/v1.0/rooms/", {}, format="json")

    assert response.status_code == 201
    room = application.rooms.get()
    assert str(room.id) == response.json()["id"]


def test_livekit_token_lives_as_long_as_the_setting_says(settings):
    """The token expires after APPLICATION_LIVEKIT_TOKEN_TTL_SECONDS."""
    settings.APPLICATION_LIVEKIT_TOKEN_TTL_SECONDS = 600
    room = room_of_the_application()
    alice = UserFactory()

    claims = decode(
        mint(alice, room, {"identity": "@alice:localhost:A"}).json()["token"]
    )

    assert 590 <= claims["exp"] - datetime.now(timezone.utc).timestamp() <= 600
