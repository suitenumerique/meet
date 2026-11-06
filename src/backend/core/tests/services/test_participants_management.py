"""Tests for the ParticipantsManagement service."""

from unittest import mock
from uuid import uuid4

import pytest

from core.models import Placement
from core.services.participants_management import ParticipantsManagement

pytestmark = pytest.mark.django_db


PARTICIPANT_CALLS = [
    pytest.param(
        lambda room_name, **kwargs: ParticipantsManagement().mute(
            room_name, "participant", "track-sid", **kwargs
        ),
        id="mute",
    ),
    pytest.param(
        lambda room_name, **kwargs: ParticipantsManagement().remove(
            room_name, "participant", **kwargs
        ),
        id="remove",
    ),
    pytest.param(
        lambda room_name, **kwargs: ParticipantsManagement().update(
            room_name, "participant", attributes={"room_role": "member"}, **kwargs
        ),
        id="update",
    ),
    pytest.param(
        lambda room_name, **kwargs: ParticipantsManagement().check_if_in_meeting(
            room_name, "participant", **kwargs
        ),
        id="check_if_in_meeting",
    ),
]


@pytest.mark.parametrize(
    "manage_participant",
    [
        *PARTICIPANT_CALLS,
        pytest.param(
            lambda room_name: ParticipantsManagement().check_if_in_meeting_cached(
                room_name, "participant"
            ),
            id="check_if_in_meeting_cached",
        ),
    ],
)
@mock.patch("core.utils.create_livekit_client")
def test_participants_managed_on_the_placed_cluster(
    mock_create_livekit_client,
    manage_participant,
    two_livekit_clusters,
    django_assert_num_queries,
):
    """Participants are managed on the LiveKit cluster their room is placed on."""
    _paris, lyon = two_livekit_clusters
    room_name = str(uuid4())
    Placement.objects.create(room_name=room_name, cluster="lyon")
    mock_create_livekit_client.return_value = mock.AsyncMock()

    with django_assert_num_queries(1):
        manage_participant(room_name)

    mock_create_livekit_client.assert_called_once_with(cluster=lyon)


@pytest.mark.parametrize("manage_participant", PARTICIPANT_CALLS)
@mock.patch("core.utils.create_livekit_client")
def test_participants_managed_on_the_given_cluster(
    mock_create_livekit_client,
    manage_participant,
    two_livekit_clusters,
    django_assert_num_queries,
):
    """Participants are managed on the cluster given, whatever the placement."""
    paris, _lyon = two_livekit_clusters
    room_name = str(uuid4())
    Placement.objects.create(room_name=room_name, cluster="lyon")
    mock_create_livekit_client.return_value = mock.AsyncMock()

    with django_assert_num_queries(0):
        manage_participant(room_name, cluster=paris)

    mock_create_livekit_client.assert_called_once_with(cluster=paris)


@pytest.mark.usefixtures("two_livekit_clusters")
@mock.patch("core.utils.create_livekit_client")
def test_check_if_in_meeting_without_room_or_identity(
    mock_create_livekit_client, django_assert_num_queries
):
    """Without a room or an identity, nobody is looked for, nor any placement."""
    with django_assert_num_queries(0):
        assert ParticipantsManagement().check_if_in_meeting("", "participant") is False
        assert ParticipantsManagement().check_if_in_meeting("room", "") is False

    mock_create_livekit_client.assert_not_called()
