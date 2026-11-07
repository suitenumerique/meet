"""
Test MetadataCollectorService service.
"""

# pylint: disable=redefined-outer-name

from unittest import mock

import pytest
from livekit.protocol.agent_dispatch import CreateAgentDispatchRequest

from core.factories import RecordingFactory
from core.models import Placement
from core.recording.services.metadata_collector import MetadataCollectorService

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_create_livekit_client():
    """Mock the creation of LiveKit clients: every client created is one mock."""
    with mock.patch("core.utils.create_livekit_client") as create_livekit_client:
        create_livekit_client.return_value = mock.AsyncMock()
        yield create_livekit_client


def test_start_on_the_recording_cluster(
    mock_create_livekit_client, two_livekit_clusters, settings
):
    """The metadata collector agent is dispatched to the room on the LiveKit
    cluster recording it, even once the room was placed elsewhere."""
    _paris, lyon = two_livekit_clusters
    recording = RecordingFactory(status="active", livekit_cluster="lyon")
    Placement.objects.create(room_name=str(recording.room.id), cluster="paris")
    client = mock_create_livekit_client.return_value
    client.agent_dispatch.create_dispatch.return_value = mock.Mock(id="AD_lyon")

    assert MetadataCollectorService().start(recording) == "AD_lyon"

    mock_create_livekit_client.assert_called_once_with(cluster=lyon)
    client.agent_dispatch.create_dispatch.assert_awaited_once_with(
        CreateAgentDispatchRequest(
            agent_name=settings.METADATA_COLLECTOR_AGENT_NAME,
            room=str(recording.room.id),
            metadata=str(recording.id),
        )
    )
    recording.refresh_from_db()
    assert recording.options == {"metadata_collector_dispatch_id": "AD_lyon"}


def test_stop_on_the_recording_cluster(
    mock_create_livekit_client, two_livekit_clusters
):
    """The metadata collector agent's dispatch is deleted on the LiveKit cluster
    recording the room, even once the room was placed elsewhere."""
    _paris, lyon = two_livekit_clusters
    recording = RecordingFactory(
        status="active",
        livekit_cluster="lyon",
        options={"metadata_collector_dispatch_id": "AD_lyon"},
    )
    Placement.objects.create(room_name=str(recording.room.id), cluster="paris")

    MetadataCollectorService().stop(recording)

    mock_create_livekit_client.assert_called_once_with(cluster=lyon)
    client = mock_create_livekit_client.return_value
    client.agent_dispatch.delete_dispatch.assert_awaited_once_with(
        dispatch_id="AD_lyon", room_name=str(recording.room.id)
    )


@pytest.mark.parametrize("livekit_cluster", ["", "lille"])
def test_start_and_stop_on_the_default_cluster(
    livekit_cluster, mock_create_livekit_client, two_livekit_clusters
):
    """A recording naming no LiveKit cluster, or one no longer registered, has
    the metadata collector agent dispatched and deleted on the default cluster,
    wherever the room is placed."""
    paris, _lyon = two_livekit_clusters
    recording = RecordingFactory(status="active", livekit_cluster=livekit_cluster)
    Placement.objects.create(room_name=str(recording.room.id), cluster="lyon")
    client = mock_create_livekit_client.return_value
    client.agent_dispatch.create_dispatch.return_value = mock.Mock(id="AD_paris")

    service = MetadataCollectorService()
    service.start(recording)
    service.stop(recording)

    assert mock_create_livekit_client.call_args_list == [mock.call(cluster=paris)] * 2
    client.agent_dispatch.delete_dispatch.assert_awaited_once_with(
        dispatch_id="AD_paris", room_name=str(recording.room.id)
    )
