"""
Test rooms API endpoints in the Meet core app: join.
"""

# pylint: disable=redefined-outer-name,too-many-lines

import json
import logging
import time
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.db import connection
from django.utils.crypto import get_random_string

import jwt
import pytest
from faker import Faker
from rest_framework.test import APIClient

from ...factories import (
    RoomFactory,
    UserFactory,
    UserResourceAccessFactory,
)
from ...livekit.clusters import get_default_livekit_cluster, get_livekit_clusters
from ...livekit.exceptions import LiveKitRoomCreationError
from ...models import Placement, RoleChoices, RoomAccessLevel
from ..utils import (
    CREATED_LIVEKIT_ROOM_SID,
    LAZY_JOIN,
    UNREACHABLE_LIVEKIT_URL,
    generate_user_access_token,
    livekit_cluster_entry,
    livekit_room,
    open_livekit_breaker,
    reporting,
)

fake = Faker()
pytestmark = pytest.mark.django_db

livekit_token = fake.sha256()

ANONYMOUS = "anonymous"
NO_ROLE = "no-role"

# Who may join a room directly, without going through the lobby
# room.get_role(user) returns None both for an anonymous user and for an
# authenticated user without access, hence the NO_ROLE
ACCESS_MATRIX = [
    (RoomAccessLevel.PUBLIC, ANONYMOUS, True),
    (RoomAccessLevel.TRUSTED, ANONYMOUS, False),
    (RoomAccessLevel.RESTRICTED, ANONYMOUS, False),
    (RoomAccessLevel.PUBLIC, NO_ROLE, True),
    (RoomAccessLevel.TRUSTED, NO_ROLE, True),
    (RoomAccessLevel.RESTRICTED, NO_ROLE, False),
    *[
        (access_level, role, True)
        for access_level in RoomAccessLevel
        for role in RoleChoices
    ],
]


def decode_token(token):
    """Decode a LiveKit access token for inspection."""
    return jwt.decode(
        token,
        settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
    )


def join_url(room_id):
    """Return the url to join a room."""
    return f"/api/v1.0/rooms/{room_id!s}/join/"


@pytest.mark.parametrize(
    ("access_level", "requester", "can_join_directly"), ACCESS_MATRIX
)
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_access(
    mock_token, access_level, requester, can_join_directly, fake_livekit_room_creation
):
    """
    Joining a room should return LiveKit credentials and the pin code only to
    users who may enter without going through the lobby, and the accesses
    only to the room's administrators and owners. Its LiveKit room should only
    be placed and created for those handed out credentials.
    """
    room = RoomFactory(
        access_level=access_level,
        configuration={"can_publish_sources": ["camera"]},
    )
    client = APIClient()
    user = AnonymousUser()
    username = fake.user_name()

    role = None
    if requester != ANONYMOUS:
        user = UserFactory()
        client.force_login(user)
        if requester != NO_ROLE:
            role = requester
            UserResourceAccessFactory(resource=room, user=user, role=role)

    response = client.post(join_url(room.id), {"username": username}, format="json")

    assert response.status_code == 200
    content = response.json()

    accesses = content.pop("accesses", None)

    if role in (RoleChoices.ADMIN, RoleChoices.OWNER):
        assert {access["id"] for access in accesses} == {
            str(access.id) for access in room.accesses.all()
        }
    else:
        assert accesses is None

    expected = {
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
        "configuration": {"can_publish_sources": ["camera"]},
        "access_level": str(access_level),
    }
    if can_join_directly:
        expected["pin_code"] = room.pin_code
        expected["livekit"] = {
            "url": settings.LIVEKIT_CONFIGURATION["url"],
            "room": str(room.id),
            "room_sid": CREATED_LIVEKIT_ROOM_SID,
            "token": livekit_token,
        }
    assert content == expected

    if can_join_directly:
        mock_token.assert_called_once_with(
            room=str(room.id),
            user=user,
            username=username,
            color=None,
            sources=["camera"],
            role=role,
            participant_id=None,
            cluster=get_default_livekit_cluster(),
        )
        fake_livekit_room_creation.assert_called_once_with(
            str(room.id), cluster=get_default_livekit_cluster()
        )
    else:
        mock_token.assert_not_called()
        fake_livekit_room_creation.assert_not_called()
    assert (
        Placement.objects.filter(room_name=str(room.id), room=room).exists()
        is can_join_directly
    )


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_by_slug(mock_token):
    """It should be possible to join a room by its slug, not normalized."""
    room = RoomFactory(name="Réunion", access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(join_url("Réunion"), {}, format="json")

    assert response.status_code == 200
    assert response.json()["id"] == str(room.id)
    assert response.json()["livekit"]["room"] == str(room.id)
    mock_token.assert_called_once()


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_members_num_queries(mock_token, django_assert_num_queries):
    """The role of the requester should only be looked up once. Placing the
    LiveKit room takes four more queries: its placement is read, created, read
    back and given the SID of the LiveKit room created."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    UserResourceAccessFactory(resource=room, user=user, role=RoleChoices.MEMBER)
    client = APIClient()
    client.force_login(user)

    with django_assert_num_queries(7):
        response = client.post(join_url(room.id), {}, format="json")

    assert response.status_code == 200
    assert "livekit" in response.json()
    assert mock_token.call_args.kwargs["role"] == RoleChoices.MEMBER


@pytest.mark.parametrize(
    ("payload", "num_queries", "room_sid"),
    [
        pytest.param({}, 5, CREATED_LIVEKIT_ROOM_SID, id="ensured"),
        pytest.param(LAZY_JOIN, 4, "RM_live", id="known-live"),
    ],
)
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_placed_room_num_queries(
    mock_token, payload, num_queries, room_sid, django_assert_num_queries
):
    """Once the LiveKit room is placed, its placement is only read and given the
    SID of the LiveKit room created, or only read when it is known to be live
    and not asked to be ensured."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    UserResourceAccessFactory(resource=room, user=user, role=RoleChoices.MEMBER)
    Placement.objects.create(
        room_name=str(room.id), room=room, cluster="default", sid="RM_live"
    )
    client = APIClient()
    client.force_login(user)

    with django_assert_num_queries(num_queries):
        response = client.post(join_url(room.id), payload, format="json")

    assert response.status_code == 200
    assert response.json()["livekit"]["room_sid"] == room_sid
    mock_token.assert_called_once()
    assert Placement.objects.get().sid == room_sid


@pytest.mark.parametrize("role", [RoleChoices.ADMIN, RoleChoices.OWNER])
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_administrators_num_queries(
    mock_token, role, django_assert_num_queries
):
    """Only the accesses should be queried on top of the role and the placement
    of the LiveKit room for administrators."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    UserResourceAccessFactory(resource=room, user=user, role=role)
    client = APIClient()
    client.force_login(user)

    with django_assert_num_queries(8):
        response = client.post(join_url(room.id), {}, format="json")

    assert response.status_code == 200
    assert "livekit" in response.json()
    assert "accesses" in response.json()
    assert mock_token.call_args.kwargs["role"] == role


def test_api_rooms_join_placed_cluster(
    two_livekit_clusters, fake_livekit_room_creation
):
    """
    Joining a room should hand out credentials for the LiveKit cluster its
    LiveKit room is placed on, where the LiveKit room is created: its URL, and
    a token it signed.
    """
    _paris, lyon = two_livekit_clusters
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    room_name = str(room.id)

    with mock.patch("core.livekit.strategies.SystemRandom.random", return_value=0.75):
        response = APIClient().post(join_url(room_name), {}, format="json")

    assert response.status_code == 200
    fake_livekit_room_creation.assert_called_once_with(room_name, cluster=lyon)

    config = response.json()["livekit"]
    assert config["url"] == lyon.url
    assert config["room"] == room_name
    assert config["room_sid"] == CREATED_LIVEKIT_ROOM_SID

    claims = jwt.decode(config["token"], lyon.api_secret, algorithms=["HS256"])
    assert claims["iss"] == lyon.api_key
    assert claims["video"]["room"] == room_name

    placement = Placement.objects.get()
    assert placement.room_name == room_name
    assert placement.room == room
    assert placement.cluster == "lyon"
    assert placement.sid == CREATED_LIVEKIT_ROOM_SID


@pytest.mark.parametrize(
    ("payload", "room_sid"),
    [
        pytest.param({}, "RM_new", id="ensured"),
        pytest.param(reporting("deleted", "RM_gone"), "RM_old", id="deleted-moved"),
    ],
)
def test_api_rooms_join_placed_room_sid(
    payload, room_sid, two_livekit_clusters, fake_livekit_room_creation
):
    """
    Joining a placed room should hand out the SID of the LiveKit room its
    cluster created, which its placement then records, or the SID it records
    when the LiveKit room reported deleted is another one.
    """
    _paris, lyon = two_livekit_clusters
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    Placement.objects.create(
        room_name=str(room.id), room=room, cluster="lyon", sid="RM_old"
    )
    fake_livekit_room_creation.return_value = livekit_room("RM_new")

    response = APIClient().post(join_url(room.id), payload, format="json")

    assert response.status_code == 200
    config = response.json()["livekit"]
    assert config["url"] == lyon.url
    assert config["room_sid"] == room_sid
    assert Placement.objects.get().sid == room_sid


@pytest.mark.parametrize(
    "payload", [{}, LAZY_JOIN, reporting("missing")], ids=["default", "lazy", "missing"]
)
def test_api_rooms_join_unregistered_default_cluster(
    payload, settings, two_livekit_clusters, fake_livekit_room_creation
):
    """
    Joining an unregistered room should hand out credentials for the default
    LiveKit cluster, whatever the placement strategy would pick, where its
    LiveKit room is created, and place nothing: Django does not follow the
    lifecycle of unregistered rooms.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = True
    paris, _lyon = two_livekit_clusters
    fake_livekit_room_creation.return_value = livekit_room("RM_unregistered")

    with mock.patch("core.livekit.strategies.SystemRandom.random", return_value=0.75):
        response = APIClient().post(
            join_url("unregistered-room"), payload, format="json"
        )

    assert response.status_code == 200
    assert not Placement.objects.exists()
    fake_livekit_room_creation.assert_called_once_with(
        "unregistered-room", cluster=paris
    )

    config = response.json()["livekit"]
    assert config["url"] == paris.url
    assert config["room"] == "unregistered-room"
    assert config["room_sid"] == "RM_unregistered"

    claims = jwt.decode(config["token"], paris.api_secret, algorithms=["HS256"])
    assert claims["iss"] == paris.api_key
    assert claims["video"]["room"] == "unregistered-room"


@pytest.mark.django_db(transaction=True)
def test_api_rooms_join_creates_livekit_room_outside_transaction(
    fake_livekit_room_creation,
):
    """
    The LiveKit room should be created outside any transaction, once its
    placement is committed: other requests see it while LiveKit answers.
    """
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    in_atomic_block = []

    def create_room(_room_name, **_kwargs):
        in_atomic_block.append(connection.in_atomic_block)
        return livekit_room()

    fake_livekit_room_creation.side_effect = create_room

    response = APIClient().post(join_url(room.id), {}, format="json")

    assert response.status_code == 200
    assert in_atomic_block == [False]


@pytest.mark.parametrize("registered", [True, False])
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_room_creation_failure(
    mock_token, registered, settings, fake_livekit_room_creation
):
    """
    Joining a room whose LiveKit room cannot be created should return a 503
    without credentials, and leave the room without placement, so that the
    next join may place it on another cluster.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = True
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC) if registered else None
    fake_livekit_room_creation.side_effect = LiveKitRoomCreationError("Timed out")

    response = APIClient().post(
        join_url(room.id if registered else "unregistered-room"), {}, format="json"
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "This room cannot be joined for now, please try again."
    }
    mock_token.assert_not_called()
    assert not Placement.objects.exists()


@pytest.mark.parametrize("registered", [True, False])
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_meeting_ended(
    mock_token, registered, settings, fake_livekit_room_creation
):
    """Reporting deleted a LiveKit room whose meeting ended should return a 409."""
    settings.ALLOW_UNREGISTERED_ROOMS = True
    lookup = "unregistered-room"
    if registered:
        room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
        Placement.objects.create(
            room_name=str(room.id), room=room, cluster="default", sid="RM_failed"
        )
        lookup = room.id

    response = APIClient().post(join_url(lookup), reporting("deleted"), format="json")

    assert response.status_code == 409
    assert response.json() == {"detail": "This meeting has ended."}
    mock_token.assert_not_called()
    fake_livekit_room_creation.assert_not_called()
    assert Placement.objects.filter(sid="RM_failed").count() == int(registered)


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_placed_room_creation_failure(
    mock_token, two_livekit_clusters, fake_livekit_room_creation
):
    """
    Joining a room placed earlier, whose LiveKit cluster cannot create its
    LiveKit room, should return a 503 without credentials, and keep its
    placement: participants may be connected there.
    """
    _paris, lyon = two_livekit_clusters
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    placement = Placement.objects.create(
        room_name=str(room.id), room=room, cluster="lyon", sid="RM_old"
    )
    fake_livekit_room_creation.side_effect = LiveKitRoomCreationError("Timed out")

    response = APIClient().post(join_url(room.id), {}, format="json")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "This room cannot be joined for now, please try again."
    }
    mock_token.assert_not_called()
    fake_livekit_room_creation.assert_called_once_with(str(room.id), cluster=lyon)
    kept_placement = Placement.objects.get()
    assert kept_placement.pk == placement.pk
    assert kept_placement.cluster == "lyon"
    assert kept_placement.sid == "RM_old"
    assert kept_placement.updated_at == placement.updated_at


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_without_candidate(
    mock_token, settings, fake_livekit_room_creation, caplog
):
    """
    Joining a room should return a 503 without credentials while no LiveKit
    cluster may receive new placements, which is logged as critical.
    """
    settings.LIVEKIT_CLUSTERS = json.dumps([livekit_cluster_entry("paris", weight=0)])
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    with caplog.at_level(logging.CRITICAL, logger="core.livekit.placements"):
        response = APIClient().post(join_url(room.id), {}, format="json")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "This room cannot be joined for now, please try again."
    }
    mock_token.assert_not_called()
    fake_livekit_room_creation.assert_not_called()
    assert "No LiveKit cluster may receive new placements" in caplog.text


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_fails_over(
    mock_token, two_livekit_clusters, fake_livekit_room_creation
):
    """
    Joining a room whose LiveKit room the cluster picked fails to create should
    hand out credentials for another cluster, which created it.
    """
    paris, lyon = two_livekit_clusters
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    fake_livekit_room_creation.side_effect = [
        LiveKitRoomCreationError("Timed out"),
        livekit_room("RM_paris"),
    ]

    with mock.patch("core.livekit.strategies.SystemRandom.random", return_value=0.75):
        response = APIClient().post(join_url(room.id), {}, format="json")

    assert response.status_code == 200
    assert response.json()["livekit"] == {
        "url": paris.url,
        "room": str(room.id),
        "room_sid": "RM_paris",
        "token": livekit_token,
    }
    assert mock_token.call_args.kwargs["cluster"] == paris
    assert fake_livekit_room_creation.call_args_list == [
        mock.call(str(room.id), cluster=lyon),
        mock.call(str(room.id), cluster=paris),
    ]
    assert Placement.objects.get().cluster == "paris"


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_without_available_candidate(
    mock_token, settings, livekit_breakers, fake_livekit_room_creation, caplog
):
    """
    Joining a room should return a 503 without credentials while every LiveKit
    cluster has its circuit breaker open, as each failed to answer lately: no
    cluster may receive new placements, which is logged as critical, once.
    """
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry(livekit_breakers(), api_url=UNREACHABLE_LIVEKIT_URL)
            for _cluster in range(2)
        ]
    )
    for cluster in get_livekit_clusters():
        open_livekit_breaker(cluster)
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    caplog.clear()

    with caplog.at_level(logging.CRITICAL, logger="core.livekit.placements"):
        response = APIClient().post(join_url(room.id), {}, format="json")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "This room cannot be joined for now, please try again."
    }
    mock_token.assert_not_called()
    fake_livekit_room_creation.assert_not_called()
    assert not Placement.objects.exists()
    assert [record.levelname for record in caplog.records] == ["CRITICAL"]
    assert "No LiveKit cluster may receive new placements" in caplog.text


@pytest.mark.real_livekit_room_creation
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_placed_on_unavailable_cluster(
    mock_token, settings, livekit_breakers, fake_livekit_server, caplog
):
    """
    Joining a room placed on a LiveKit cluster whose circuit breaker is open
    should return a 503 without credentials at once, rather than once the
    cluster failed to create its LiveKit room in time, without calling the
    cluster nor logging a traceback. The placement stays: participants may be
    connected there.
    """
    settings.LIVEKIT_API_TIMEOUT_SECONDS = 10
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [
            livekit_cluster_entry(livekit_breakers(), api_url=fake_livekit_server.url)
            for _cluster in range(2)
        ]
    )
    _available, unavailable = get_livekit_clusters()
    fake_livekit_server.status = 503
    open_livekit_breaker(unavailable)
    fake_livekit_server.released.clear()
    calls = list(fake_livekit_server.paths)
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    placement = Placement.objects.create(
        room_name=str(room.id), room=room, cluster=unavailable.name, sid="RM_old"
    )
    caplog.clear()

    started = time.monotonic()
    with caplog.at_level(logging.INFO):
        response = APIClient().post(join_url(room.id), {}, format="json")
    elapsed = time.monotonic() - started

    assert response.status_code == 503
    assert response.json() == {
        "detail": "This room cannot be joined for now, please try again."
    }
    assert elapsed < 5
    assert fake_livekit_server.paths == calls
    mock_token.assert_not_called()
    kept_placement = Placement.objects.get()
    assert kept_placement.pk == placement.pk
    assert kept_placement.cluster == unavailable.name
    assert kept_placement.sid == "RM_old"
    assert kept_placement.updated_at == placement.updated_at
    assert not [record for record in caplog.records if record.exc_info]
    assert (
        f"LiveKit cluster {unavailable.name} failed to create LiveKit room "
        f"{room.id!s}: its circuit breaker refused the call"
    ) in caplog.text


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"failure": "missing"}, "non_field_errors"),
        ({"failed_room_sid": "RM_failed"}, "non_field_errors"),
        ({"failure": "lost", "failed_room_sid": "RM_failed"}, "failure"),
        ({"failure": "missing", "failed_room_sid": ""}, "failed_room_sid"),
        ({"failure": "missing", "failed_room_sid": "R" * 64}, "failed_room_sid"),
        ({"ensure_room": "maybe"}, "ensure_room"),
    ],
)
def test_api_rooms_join_invalid_intent(payload, field, fake_livekit_room_creation):
    """An invalid way of asking where to connect should be rejected with a 400."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(join_url(room.id), payload, format="json")

    assert response.status_code == 400
    assert list(response.json()) == [field]
    fake_livekit_room_creation.assert_not_called()
    assert not Placement.objects.exists()


def test_api_rooms_join_get_not_allowed():
    """Joining a room should only be possible with a POST request."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().get(join_url(room.id))

    assert response.status_code == 405


@pytest.mark.parametrize("authenticated", [False, True])
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_unregistered_allowed(mock_token, authenticated, settings):
    """
    Joining an unregistered room should return LiveKit credentials for the
    room named after the slug, when unregistered rooms are allowed.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = True
    client = APIClient()
    user = AnonymousUser()
    username = fake.user_name()
    if authenticated:
        user = UserFactory()
        client.force_login(user)

    response = client.post(
        join_url("unregistered-room"), {"username": username}, format="json"
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": None,
        "slug": "unregistered-room",
        "access_level": "public",
        "livekit": {
            "url": settings.LIVEKIT_CONFIGURATION["url"],
            "room": "unregistered-room",
            "room_sid": CREATED_LIVEKIT_ROOM_SID,
            "token": livekit_token,
        },
    }
    mock_token.assert_called_once_with(
        room="unregistered-room",
        user=user,
        username=username,
        color=None,
        sources=None,
        role=None,
        participant_id=None,
        cluster=get_default_livekit_cluster(),
    )


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_unregistered_allowed_not_normalized(mock_token, settings):
    """
    Joining an unregistered room by a slug that is not normalized should use
    the LiveKit room named after the url-safe slug.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = True

    response = APIClient().post(join_url("Réunion"), {}, format="json")

    assert response.status_code == 200
    assert response.json() == {
        "id": None,
        "slug": "reunion",
        "access_level": "public",
        "livekit": {
            "url": settings.LIVEKIT_CONFIGURATION["url"],
            "room": "reunion",
            "room_sid": CREATED_LIVEKIT_ROOM_SID,
            "token": livekit_token,
        },
    }
    mock_token.assert_called_once_with(
        room="reunion",
        user=AnonymousUser(),
        username=None,
        color=None,
        sources=None,
        role=None,
        participant_id=None,
        cluster=get_default_livekit_cluster(),
    )


def test_api_rooms_join_unregistered_token_claims(settings):
    """The token of an unregistered room should be scoped to it and carry the name."""
    settings.ALLOW_UNREGISTERED_ROOMS = True
    username = fake.user_name()

    response = APIClient().post(
        join_url("unregistered-room"), {"username": username}, format="json"
    )

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == username
    assert claims["video"]["room"] == "unregistered-room"


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_unregistered_not_allowed(mock_token, settings):
    """
    Joining an unregistered room should return a 404 if unregistered rooms
    are not allowed.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = False

    response = APIClient().post(join_url("unregistered-room"), {}, format="json")

    assert response.status_code == 404
    assert response.json() == {"detail": "No Room matches the given query."}
    mock_token.assert_not_called()


@pytest.mark.parametrize("lookup", ["---", "!!!", "_"])
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_unregistered_empty_slug(mock_token, lookup, settings):
    """
    Joining an unregistered room whose slug is empty once normalized should
    return a 404 rather than credentials for a room with no name.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = True

    response = APIClient().post(join_url(lookup), {}, format="json")

    assert response.status_code == 404
    assert response.json() == {"detail": "No Room matches the given query."}
    mock_token.assert_not_called()


@pytest.mark.parametrize("template", ["{}!", "_{}", "{}~", "{}!!"])
@pytest.mark.parametrize(
    "access_level", [RoomAccessLevel.TRUSTED, RoomAccessLevel.RESTRICTED]
)
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_unregistered_uuid_slug(
    mock_token, access_level, template, settings
):
    """
    Joining an unregistered room whose slug is a UUID once normalized should
    return a 404 rather than credentials for the registered room with that id.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = True
    room = RoomFactory(access_level=access_level)

    response = APIClient().post(
        join_url(template.format(str(room.id).upper())), {}, format="json"
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "No Room matches the given query."}
    mock_token.assert_not_called()


@pytest.mark.parametrize(
    "payload", [{}, reporting("deleted")], ids=["default", "deleted"]
)
@pytest.mark.parametrize("allow_unregistered_rooms", [True, False])
@pytest.mark.parametrize("lookup", ["id", "slug"])
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_soft_deleted(
    mock_token, lookup, allow_unregistered_rooms, payload, settings
):
    """
    Joining a soft-deleted room should return a 410 whatever it reports, and
    never fall back to an unregistered room with the same slug.
    """
    settings.ALLOW_UNREGISTERED_ROOMS = allow_unregistered_rooms
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    room.soft_delete()

    response = APIClient().post(join_url(getattr(room, lookup)), payload, format="json")

    assert response.status_code == 410
    assert response.json() == {"detail": "This room has been deleted."}
    mock_token.assert_not_called()


@pytest.mark.parametrize(
    ("payload", "expected_username"),
    [
        ({"username": "Jean Bon"}, "Jean Bon"),
        ({"username": "  Jean Bon  "}, "Jean Bon"),
        ({"username": "x" * 255}, "x" * 255),
        ({}, None),
        ({"username": None}, None),
        ({"username": ""}, None),
        ({"username": "   "}, None),
    ],
)
@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_username(mock_token, payload, expected_username):
    """
    The trimmed display name should be passed on to the token, a missing or
    blank one leaving the default name to the token generation.
    """
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(join_url(room.id), payload, format="json")

    assert response.status_code == 200
    assert response.json()["livekit"]["token"] == livekit_token
    assert mock_token.call_args.kwargs["username"] == expected_username


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_username_too_long(mock_token):
    """A display name exceeding 255 characters should be rejected."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(
        join_url(room.id), {"username": "a" * 256}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {
        "username": ["Ensure this field has no more than 255 characters."]
    }
    mock_token.assert_not_called()


@mock.patch("core.utils.generate_token", return_value=livekit_token)
def test_api_rooms_join_username_in_query_string_ignored(mock_token):
    """The display name should only be read from the request body."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    username = fake.user_name()

    response = APIClient().post(
        f"{join_url(room.id)}?username={username}", {}, format="json"
    )

    assert response.status_code == 200
    assert mock_token.call_args.kwargs["username"] is None


def test_api_rooms_join_token_claims_anonymous():
    """The token should carry the submitted display name and be scoped to the room."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    username = fake.user_name()

    response = APIClient().post(
        join_url(room.id), {"username": username}, format="json"
    )

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == username
    assert claims["video"]["room"] == str(room.id)
    assert claims["video"]["roomAdmin"] is False


def test_api_rooms_join_token_claims_anonymous_default_name():
    """An anonymous user joining without a display name should get the default one."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(join_url(room.id), {"username": ""}, format="json")

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == "Anonymous"


def test_api_rooms_join_token_claims_owner():
    """The token of an owner should carry the submitted name and the room admin grant."""
    username = fake.user_name()
    user = UserFactory(full_name=fake.name())
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.post(join_url(room.id), {"username": username}, format="json")

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == username
    assert claims["sub"] == str(user.sub)
    assert claims["video"]["roomAdmin"] is True


def test_api_rooms_join_display_name_edit_disabled(settings):
    """
    An authenticated user should keep their account's name when display name
    edition is disabled, whatever name they submit.
    """
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False
    full_name = f"{fake.first_name()} {fake.last_name()}"
    user = UserFactory(full_name=full_name)
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient()
    client.force_login(user)

    response = client.post(join_url(room.id), {"username": "Impostor"}, format="json")

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == full_name


def test_api_rooms_join_display_name_edit_disabled_anonymous(settings):
    """Anonymous users should still choose their display name when edition is disabled."""
    settings.AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME = False
    username = fake.user_name()
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)

    response = APIClient().post(
        join_url(room.id), {"username": username}, format="json"
    )

    assert response.status_code == 200
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["name"] == username


def test_api_rooms_join_session_without_csrf_token():
    """A session-authenticated request without a CSRF token should be rejected."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)

    response = client.post(join_url(room.id), {"username": "Jane"}, format="json")

    assert response.status_code == 403
    assert response.json()["detail"].startswith("CSRF Failed")


def test_api_rooms_join_session_with_csrf_token():
    """A session-authenticated request with a valid CSRF token should be accepted."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)
    csrf_secret = get_random_string(32)
    client.cookies[settings.CSRF_COOKIE_NAME] = csrf_secret

    response = client.post(
        join_url(room.id),
        {"username": "Jane"},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_secret,
    )

    assert response.status_code == 200
    assert "livekit" in response.json()


def test_api_rooms_join_session_with_csrf_token_foreign_origin():
    """A session-authenticated request from a foreign origin should be rejected."""
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)
    csrf_secret = get_random_string(32)
    client.cookies[settings.CSRF_COOKIE_NAME] = csrf_secret

    response = client.post(
        join_url(room.id),
        {"username": "Jane"},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_secret,
        HTTP_ORIGIN="https://evil.example",
    )

    assert response.status_code == 403
    assert response.json()["detail"].startswith("CSRF Failed: Origin checking failed")


def test_api_rooms_join_anonymous_without_csrf_token():
    """
    An anonymous request carries no ambient credential, so it should not be
    subject to CSRF checks.
    """
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    client = APIClient(enforce_csrf_checks=True)

    response = client.post(join_url(room.id), {"username": "Anonymous"}, format="json")

    assert response.status_code == 200
    assert "livekit" in response.json()


def test_api_rooms_join_user_access_token_without_csrf_token():
    """
    A request authenticated with a user access token carries no ambient
    credential, so it should not be subject to CSRF checks.
    """
    username = fake.user_name()
    user = UserFactory()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, users=[(user, "owner")])
    client = APIClient(enforce_csrf_checks=True)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_user_access_token(user)}")

    response = client.post(join_url(room.id), {"username": username}, format="json")

    assert response.status_code == 200
    assert response.json()["pin_code"] == room.pin_code
    assert "accesses" in response.json()
    claims = decode_token(response.json()["livekit"]["token"])
    assert claims["sub"] == str(user.sub)
