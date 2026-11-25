"""Test diagnostics API endpoints."""

import json
import uuid
from unittest import mock

from django.test.utils import override_settings
from django.urls import reverse

import jwt
import pytest
from rest_framework.test import APIClient

from core.api.throttling import (
    ConnectionTestAnonRateThrottle,
    ConnectionTestUserRateThrottle,
)
from core.factories import UserFactory
from core.livekit.clusters import get_livekit_cluster
from core.livekit.exceptions import LiveKitRoomCreationError
from core.models import Placement
from core.tests.utils import livekit_cluster_entry, livekit_room, random_remote_addr

pytestmark = pytest.mark.django_db


def test_api_diagnostics_connection_url():
    """The connection check is exposed under the diagnostics namespace."""
    assert reverse("diagnostics-connection") == "/api/v1.0/diagnostics/connection/"


def test_api_diagnostics_connection_rejects_get():
    """Only POST is exposed, the endpoint has no side effect to trigger."""
    client = APIClient()
    response = client.get("/api/v1.0/diagnostics/connection/")

    assert response.status_code == 405


def test_api_diagnostics_connection_returns_ephemeral_livekit_config(settings, client):
    """Each request gets a dedicated room and a short-lived token."""

    settings.CONNECTION_TEST_TOKEN_TTL_SECONDS = 600
    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"

    response_a = client.post("/api/v1.0/diagnostics/connection/")
    response_b = client.post("/api/v1.0/diagnostics/connection/")

    assert response_a.status_code == 200
    assert response_b.status_code == 200

    data_a = response_a.json()
    data_b = response_b.json()

    room_a = data_a["livekit"]["room"]
    room_b = data_b["livekit"]["room"]

    assert room_a.startswith("connection-test-")
    assert room_b.startswith("connection-test-")
    uuid.UUID(room_a.removeprefix("connection-test-"))
    uuid.UUID(room_b.removeprefix("connection-test-"))
    assert room_a != room_b
    assert data_a["livekit"]["url"]
    assert data_a["livekit"]["token"]
    assert data_a["livekit"]["expires_in"] == 600
    assert data_a["livekit"]["token"] != data_b["livekit"]["token"]


def test_api_diagnostics_connection_token_is_short_lived_for_user(settings, client):
    """Connection test tokens expire quickly for users."""

    settings.CONNECTION_TEST_TOKEN_TTL_SECONDS = 300

    client = APIClient()
    response = client.post("/api/v1.0/diagnostics/connection/")

    assert response.status_code == 200

    config = response.json()["livekit"]
    payload = jwt.decode(
        config["token"],
        settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
        options={"verify_exp": False},
    )

    assert config["expires_in"] == 300
    assert payload["video"]["room"] == config["room"]
    assert payload["name"] == "Connection Test"
    assert payload["video"]["roomAdmin"] is False
    assert payload["exp"] - payload["nbf"] == 300


@override_settings()
def test_api_diagnostics_connection_token_for_authenticated_user(settings, client):
    """Logged-in users get a token bound to their own identity."""

    settings.CONNECTION_TEST_TOKEN_TTL_SECONDS = 300

    user = UserFactory()
    client.force_login(user)

    response = client.post("/api/v1.0/diagnostics/connection/")

    assert response.status_code == 200

    payload = jwt.decode(
        response.json()["livekit"]["token"],
        settings.LIVEKIT_CONFIGURATION["api_secret"],
        algorithms=["HS256"],
        options={"verify_exp": False},
    )

    assert payload["sub"] == str(user.sub)
    assert payload["video"]["roomAdmin"] is False
    assert payload["exp"] - payload["nbf"] == 300


def test_api_diagnostics_connection_chosen_cluster(
    settings, fake_livekit_room_creation
):
    """The connection is tested on the LiveKit cluster the placement strategy
    picks, where the room is created, without any placement.

    Browsers are given its URL, not the API URL Django calls it on.
    """
    lyon = livekit_cluster_entry("lyon", api_url="http://livekit.lyon.svc:7880")
    settings.LIVEKIT_CLUSTERS = json.dumps([livekit_cluster_entry("paris"), lyon])

    with mock.patch("core.livekit.strategies.SystemRandom.random", return_value=0.75):
        response = APIClient(REMOTE_ADDR=random_remote_addr()).post(
            "/api/v1.0/diagnostics/connection/"
        )

    assert response.status_code == 200
    config = response.json()["livekit"]
    assert config["url"] == lyon["url"]
    payload = jwt.decode(config["token"], lyon["api_secret"], algorithms=["HS256"])
    assert payload["iss"] == lyon["api_key"]
    assert payload["video"]["room"] == config["room"]
    fake_livekit_room_creation.assert_called_once_with(
        config["room"], cluster=get_livekit_cluster("lyon")
    )
    assert not Placement.objects.exists()


def test_api_diagnostics_connection_fails_over(settings, fake_livekit_room_creation):
    """The connection is tested on another LiveKit cluster when the one the
    placement strategy picks fails to create the room."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon")]
    )
    paris, lyon = get_livekit_cluster("paris"), get_livekit_cluster("lyon")
    fake_livekit_room_creation.side_effect = [
        LiveKitRoomCreationError("Timed out"),
        livekit_room(),
    ]

    with mock.patch("core.livekit.strategies.SystemRandom.random", return_value=0.75):
        response = APIClient(REMOTE_ADDR=random_remote_addr()).post(
            "/api/v1.0/diagnostics/connection/"
        )

    assert response.status_code == 200
    config = response.json()["livekit"]
    assert config["url"] == paris.url
    assert fake_livekit_room_creation.call_args_list == [
        mock.call(config["room"], cluster=lyon),
        mock.call(config["room"], cluster=paris),
    ]


@mock.patch("core.api.viewsets.delete_connection_test_room.apply_async")
def test_api_diagnostics_connection_room_creation_failure(
    mock_apply_async, settings, fake_livekit_room_creation
):
    """A connection cannot be tested for now when its LiveKit cluster fails to
    create the room: no deletion is scheduled then."""
    settings.CELERY_ENABLED = True
    fake_livekit_room_creation.side_effect = LiveKitRoomCreationError("Timed out")

    response = APIClient(REMOTE_ADDR=random_remote_addr()).post(
        "/api/v1.0/diagnostics/connection/"
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "This room cannot be joined for now, please try again."
    }
    mock_apply_async.assert_not_called()


def test_api_diagnostics_connection_without_candidate(
    settings, fake_livekit_room_creation
):
    """A connection cannot be tested for now when no LiveKit cluster may receive
    new placements."""
    settings.LIVEKIT_CLUSTERS = json.dumps([livekit_cluster_entry("paris", weight=0)])

    response = APIClient(REMOTE_ADDR=random_remote_addr()).post(
        "/api/v1.0/diagnostics/connection/"
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "This room cannot be joined for now, please try again."
    }
    fake_livekit_room_creation.assert_not_called()


@mock.patch("core.api.viewsets.delete_connection_test_room.apply_async")
def test_api_diagnostics_connection_schedules_room_deletion(
    mock_apply_async, settings, client
):
    """When Celery is enabled, schedule a hard room delete after max age, on the
    LiveKit cluster the room was created on."""

    settings.CELERY_ENABLED = True
    settings.CONNECTION_TEST_TOKEN_TTL_SECONDS = 300
    settings.CONNECTION_TEST_ROOM_EXTRA_AGE_SECONDS = 10
    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"

    response = client.post("/api/v1.0/diagnostics/connection/")

    assert response.status_code == 200
    room = response.json()["livekit"]["room"]
    mock_apply_async.assert_called_once_with(args=[room, "default"], countdown=310)


@mock.patch("core.api.viewsets.delete_connection_test_room.apply_async")
def test_api_diagnostics_connection_skips_room_deletion_without_celery(
    mock_apply_async, settings, client
):
    """Without Celery, do not schedule deletion (apply_async would run immediately)."""

    settings.CELERY_ENABLED = False
    response = client.post("/api/v1.0/diagnostics/connection/")

    assert response.status_code == 200
    mock_apply_async.assert_not_called()


@pytest.mark.parametrize(
    "throttle_class",
    [ConnectionTestAnonRateThrottle, ConnectionTestUserRateThrottle],
)
def test_api_diagnostics_connection_is_throttled(throttle_class, client):
    """Both throttles stay wired to the action once routed through the viewset."""
    with (
        mock.patch.object(throttle_class, "allow_request", return_value=False),
        mock.patch.object(throttle_class, "wait", return_value=42),
    ):
        response = client.post("/api/v1.0/diagnostics/connection/")

    assert response.status_code == 429


def test_api_diagnostics_connection_feature_flag(client, settings):
    """Should return a not found error when the connection diagnostics feature is disabled."""

    settings.CONNECTION_TEST_ENABLED = False

    response = client.post("/api/v1.0/diagnostics/connection/")
    assert response.status_code == 404
