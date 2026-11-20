"""
Test LiveKitEvents service.
"""
# pylint: disable=W0621,W0613, W0212, E0611, E1101, C0302

import json
import logging
import uuid
from datetime import timedelta
from unittest import mock

from django.utils import timezone

import pytest
from faker import Faker
from livekit.api import EgressStatus

from core.audit.testing import find_events
from core.factories import RecordingFactory, RoomFactory
from core.livekit.clusters import (
    LiveKitClusterTokenVerifier,
    get_default_livekit_cluster,
    get_livekit_clusters,
)
from core.livekit.exceptions import PlacementChangedError
from core.livekit.placements import PlacementService
from core.models import Placement, Room
from core.recording.enums import RecordingWorkerEvent
from core.recording.services.recording_events import RecordingEventsService
from core.services.livekit_events import (
    EGRESS_CPU_EXHAUSTED_DETAILS,
    EGRESS_ROOM_CONNECTION_FAILED_ERROR,
    EGRESS_STATUS_TO_RECORDING_EVENT,
    ActionFailedError,
    AuthenticationError,
    InvalidPayloadError,
    LiveKitEventsService,
    api,
    to_ended_recording_event,
    to_recording_event,
)
from core.services.lobby import LobbyService
from core.services.presence import PresenceCache
from core.services.room_management import (
    RoomManagementException,
    RoomNotFoundException,
)
from core.services.sip_management import (
    SIPException,
    SIPManagement,
)
from core.tests.utils import (
    livekit_cluster_entry,
    livekit_room,
    livekit_webhook_token,
)
from core.utils import NotificationError

pytestmark = pytest.mark.django_db
fake = Faker()

SID = "RM_hycBMAjmt6Ub"
OTHER_SID = "RM_dxSBWkfXbe4v"


@pytest.fixture
def mock_livekit_config(settings):
    """Mock LiveKit configuration."""
    settings.LIVEKIT_CONFIGURATION = {
        "api_key": "test_api_key",
        "api_secret": "test_api_secret",
        "url": "https://test-livekit.example.com/",
    }
    return settings.LIVEKIT_CONFIGURATION


@pytest.fixture
def service(mock_livekit_config):
    """Initialize LiveKitEventsService."""
    return LiveKitEventsService()


def test_initialization():
    """Should correctly initialize the service with required dependencies.

    Webhooks are verified with the keys of whichever LiveKit cluster signed them.
    """

    service = LiveKitEventsService()

    assert isinstance(service.token_verifier, LiveKitClusterTokenVerifier)
    assert isinstance(service.lobby_service, LobbyService)
    assert isinstance(service.sip_management, SIPManagement)
    assert isinstance(service.recording_events, RecordingEventsService)


def test_cluster_defaults_to_the_default_cluster(service):
    """Before any webhook is received, the service's cluster is the default one.

    Handlers called directly therefore act on the default cluster.
    """
    assert service.cluster == get_default_livekit_cluster()
    assert service.cluster.name == "default"


def webhook_request(body, api_key, api_secret):
    """Return a webhook request whose body is signed with this API key and secret."""
    request = mock.MagicMock()
    request.headers = {
        "Authorization": livekit_webhook_token(body, api_key, api_secret)
    }
    request.body = body.encode()
    return request


def room_event_request(cluster, event, room_name, sid=SID):
    """Return the webhook request a LiveKit cluster sends on an event of a room."""
    body = json.dumps({"event": event, "room": {"name": room_name, "sid": sid}})
    return webhook_request(body, cluster.api_key, cluster.api_secret)


def room_started(room_name, sid=SID):
    """Return the event a LiveKit cluster sends when a LiveKit room starts."""
    return api.WebhookEvent(
        event="room_started", room=livekit_room(sid, name=room_name)
    )


@pytest.fixture
def room_cleanup(settings):
    """Mock the cleanup of a room whose LiveKit room finished.

    Provide the mocks clearing its presence and lobby caches. Telephony and
    roomkit are disabled, as they are with several LiveKit clusters: the room
    has no SIP dispatch rule to delete.
    """
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    with (
        mock.patch.object(PresenceCache, "clear_room") as clear_presence,
        mock.patch.object(LobbyService, "clear_room_cache") as clear_lobby,
    ):
        yield [clear_presence, clear_lobby]


@mock.patch.object(LiveKitEventsService, "_handle_room_finished")
def test_receive_identifies_the_cluster(
    mock_handle_room_finished, two_livekit_clusters
):
    """The cluster whose API key signed a webhook becomes the service's cluster."""
    _paris, lyon = two_livekit_clusters
    body = json.dumps({"event": "room_finished", "room": {"name": str(uuid.uuid4())}})

    service = LiveKitEventsService()
    service.receive(webhook_request(body, lyon.api_key, lyon.api_secret))

    mock_handle_room_finished.assert_called_once()
    assert service.cluster == lyon


@pytest.mark.usefixtures("two_livekit_clusters")
@mock.patch.object(LiveKitEventsService, "_handle_room_finished")
def test_receive_unknown_cluster(mock_handle_room_finished):
    """A webhook signed with an API key no cluster uses is an invalid payload."""
    body = json.dumps({"event": "room_finished", "room": {"name": str(uuid.uuid4())}})
    request = webhook_request(
        body, "key-lille", "secret-lille-padded-for-minimum-len!-livekit"
    )

    service = LiveKitEventsService()
    with pytest.raises(InvalidPayloadError, match="Invalid webhook payload"):
        service.receive(request)

    mock_handle_room_finished.assert_not_called()


@pytest.mark.parametrize(
    ("mode", "notification_type"),
    (
        ("screen_recording", "screenRecordingLimitReached"),
        ("transcript", "transcriptionLimitReached"),
    ),
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_success(  # pylint: disable=too-many-arguments, too-many-positional-arguments
    mock_update_metadata, mock_notify, mode, notification_type, service
):
    """Should successfully stop recording and notify all participant."""

    recording = RecordingFactory(worker_id="worker-1", mode=mode, status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    service._handle_egress_ended(mock_data)

    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id),
        notification_data={"type": notification_type},
        cluster=get_default_livekit_cluster(),
    )
    mock_update_metadata.assert_called_once_with(
        str(recording.room.id),
        remove_keys=["recording_mode", "recording_status"],
        cluster=get_default_livekit_cluster(),
    )

    recording.refresh_from_db()

    # NB: notify_external_services will return False, so status is "saved"
    assert recording.status == "saved"


@pytest.mark.parametrize(
    ("egress_status", "status"),
    (
        (EgressStatus.EGRESS_ACTIVE, "started"),
        (EgressStatus.EGRESS_ENDING, "saving"),
    ),
)
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_updated_success(
    mock_update_metadata, egress_status, status, service
):
    """Should successfully update room's metadata."""

    recording = RecordingFactory(worker_id="worker-1", status="initiated")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = egress_status

    service._handle_egress_updated(mock_data)

    mock_update_metadata.assert_called_once_with(
        str(recording.room.id),
        {"recording_status": status},
        cluster=get_default_livekit_cluster(),
    )


@pytest.mark.parametrize(
    ("mode", "notification_type"),
    (
        ("screen_recording", "screenRecordingLimitReached"),
        ("transcript", "transcriptionLimitReached"),
    ),
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_metadata_update_fails(  # pylint: disable=too-many-arguments, too-many-positional-arguments
    mock_update_metadata, mock_notify, mode, notification_type, service
):
    """Should successfully stop and save recording when metadata's update fails."""

    recording = RecordingFactory(worker_id="worker-1", mode=mode, status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    mock_update_metadata.side_effect = RoomManagementException("Error notifying")

    service._handle_egress_ended(mock_data)

    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id),
        notification_data={"type": notification_type},
        cluster=get_default_livekit_cluster(),
    )
    recording.refresh_from_db()

    # NB: notify_external_services will return False, so status is "saved"
    assert recording.status == "saved"


@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_notification_fails(
    mock_update_metadata, mock_notify, mock_notify_external_services, service
):
    """Should still stop and save the recording when notifying participants fails."""

    mock_notify_external_services.return_value = False
    mock_notify.side_effect = NotificationError("Error notifying")

    recording = RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    service._handle_egress_ended(mock_data)

    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id),
        notification_data={"type": "screenRecordingLimitReached"},
        cluster=get_default_livekit_cluster(),
    )
    mock_update_metadata.assert_called_once_with(
        str(recording.room.id),
        remove_keys=["recording_mode", "recording_status"],
        cluster=get_default_livekit_cluster(),
    )

    recording.refresh_from_db()
    assert recording.status == "saved"


@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_recording_not_found(
    mock_update_metadata, mock_notify, service
):
    """Should raise ActionFailedError when recording doesn't exist."""

    recording = RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = "worker-2"
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    with pytest.raises(
        ActionFailedError, match=r"Recording with worker ID .+ does not exist"
    ):
        service._handle_egress_ended(mock_data)

    mock_notify.assert_not_called()
    mock_update_metadata.assert_not_called()

    recording.refresh_from_db()
    assert recording.status == "active"


@pytest.mark.parametrize(
    "egress_status",
    (
        EgressStatus.EGRESS_FAILED,
        EgressStatus.EGRESS_ABORTED,
        EgressStatus.EGRESS_LIMIT_REACHED,
    ),
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_recording_should_not_be_saved(
    mock_update_metadata, mock_notify, egress_status, service
):
    """Don't update status for recordings that must not be saved."""

    recording = RecordingFactory(worker_id="worker-1", status="failed_to_stop")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = "worker-1"
    mock_data.egress_info.status = egress_status

    service._handle_egress_ended(mock_data)

    mock_notify.assert_not_called()
    mock_update_metadata.assert_called_once_with(
        str(recording.room.id),
        remove_keys=["recording_mode", "recording_status"],
        cluster=get_default_livekit_cluster(),
    )

    recording.refresh_from_db()
    assert recording.status == "failed_to_stop"


@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_complete_does_not_notify_participants(
    mock_update_metadata, mock_notify, mock_notify_external_services, service
):
    """Shouldn't notify participants on a successful egress.

    EGRESS_COMPLETE is the only ended status that notifies no one: limit
    reached, aborted and failed egresses each send their own notification.
    A stopped recording is simply finalized, which is the nominal flow once
    the egress uploaded the file of a user-initiated stop.
    """

    mock_notify_external_services.return_value = False

    recording = RecordingFactory(worker_id="worker-1", status="stopped")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = "worker-1"
    mock_data.egress_info.status = EgressStatus.EGRESS_COMPLETE

    service._handle_egress_ended(mock_data)

    mock_notify.assert_not_called()
    mock_update_metadata.assert_called_once_with(
        str(recording.room.id),
        remove_keys=["recording_mode", "recording_status"],
        cluster=get_default_livekit_cluster(),
    )
    mock_notify_external_services.assert_called_once_with(recording)

    recording.refresh_from_db()
    assert recording.status == "saved"


@mock.patch("core.services.livekit_events.MetadataCollectorService")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_calls_metadata_collector_stop_when_conditions_are_met(
    mock_update_metadata, mock_collector_class, service, settings
):
    """Should call MetadataCollectorService.stop when it exists."""
    settings.METADATA_COLLECTOR_ENABLED = True

    recording = RecordingFactory(
        worker_id="worker-1",
        status="active",
        options={"metadata_collector_dispatch_id": "dispatch-123"},
    )
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_COMPLETE

    mock_collector = mock.Mock()
    mock_collector_class.return_value = mock_collector

    service._handle_egress_ended(mock_data)

    mock_collector.stop.assert_called_once_with(recording)


@pytest.mark.parametrize(
    "metadata_enabled,options",
    [
        (True, {}),
        (False, {}),
    ],
)
@mock.patch("core.services.livekit_events.MetadataCollectorService")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_does_not_call_metadata_collector_stop_when_conditions_not_met(
    _, mock_collector_class, metadata_enabled, options, service, settings
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Should not call MetadataCollectorService.stop when it does not exist."""
    settings.METADATA_COLLECTOR_ENABLED = metadata_enabled

    recording = RecordingFactory(
        worker_id="worker-1",
        status="active",
        options=options,
    )
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_COMPLETE

    mock_collector = mock.Mock()
    mock_collector_class.return_value = mock_collector

    service._handle_egress_ended(mock_data)

    mock_collector.stop.assert_not_called()


@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services",
    return_value=True,
)
@mock.patch("core.utils.create_livekit_client")
def test_handle_egress_ended_on_the_recording_cluster(
    mock_create_livekit_client,
    mock_notify_external_services,
    service,
    two_livekit_clusters,
):
    """An ended egress is handled on the LiveKit cluster recording the room.

    The room's metadata is cleaned up, the metadata collector's dispatch deleted
    and participants notified there, even once the room was placed elsewhere.
    """
    paris, lyon = two_livekit_clusters
    recording = RecordingFactory(
        worker_id="worker-1",
        status="active",
        livekit_cluster="lyon",
        options={"metadata_collector_dispatch_id": "dispatch-123"},
    )
    Placement.objects.create(room_name=str(recording.room.id), cluster="paris")
    client = mock.AsyncMock()
    client.room.list_rooms.return_value = mock.Mock(rooms=[mock.Mock(metadata="")])
    mock_create_livekit_client.return_value = client
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_LIMIT_REACHED

    assert service.cluster == paris
    service._handle_egress_ended(mock_data)

    assert mock_create_livekit_client.call_args_list == [mock.call(cluster=lyon)] * 3
    client.room.update_room_metadata.assert_awaited_once()
    client.agent_dispatch.delete_dispatch.assert_awaited_once_with(
        dispatch_id="dispatch-123", room_name=str(recording.room.id)
    )
    client.room.send_data.assert_awaited_once()
    mock_notify_external_services.assert_called_once_with(recording)


@pytest.mark.parametrize(
    ("egress_status", "recording_status", "event", "expected_level"),
    (
        (EgressStatus.EGRESS_ABORTED, "active", "aborted", logging.INFO),
        (EgressStatus.EGRESS_FAILED, "active", "failed", logging.ERROR),
        # The synchronous stop may already have persisted the terminal status,
        # and the error details exist only in the webhook payload.
        (EgressStatus.EGRESS_ABORTED, "aborted", "aborted", logging.INFO),
        (EgressStatus.EGRESS_FAILED, "failed", "failed", logging.ERROR),
    ),
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_logs_livekit_error(  # noqa: PLR0913, PLR0917
    mock_update_metadata,
    mock_notify,
    egress_status,
    recording_status,
    event,
    expected_level,
    service,
    caplog,
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Should log the reason LiveKit reported an unsuccessful egress."""

    recording = RecordingFactory(worker_id="worker-1", status=recording_status)
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = egress_status
    mock_data.egress_info.error = "could not connect to the room"
    mock_data.egress_info.error_code = 500

    with caplog.at_level(logging.INFO):
        service._handle_egress_ended(mock_data)

    assert (
        f"Recording worker reported {event} for recording {recording.id}" in caplog.text
    )
    assert "could not connect to the room" in caplog.text
    assert "error_code=500" in caplog.text

    worker_logs = [
        record
        for record in caplog.records
        if record.name == "core.recording.services.recording_events"
    ]
    assert [record.levelno for record in worker_logs] == [expected_level]


@pytest.mark.parametrize(
    "egress_status",
    (EgressStatus.EGRESS_COMPLETE, EgressStatus.EGRESS_LIMIT_REACHED),
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_does_not_log_error_on_successful_egress(  # noqa: PLR0913, PLR0917
    mock_update_metadata,
    mock_notify,
    mock_notify_external_services,
    egress_status,
    service,
    caplog,
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Shouldn't log an egress error when LiveKit reports a successful egress."""

    recording = RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = egress_status

    with caplog.at_level(logging.ERROR):
        service._handle_egress_ended(mock_data)

    assert "Recording worker reported" not in caplog.text


@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_logs_livekit_error_before_cleaning_up(
    mock_update_metadata, mock_notify, service, caplog
):
    """Should log the failure reason even when the cleanup fails afterwards."""

    mock_update_metadata.side_effect = RuntimeError("LiveKit is unreachable")

    recording = RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = EgressStatus.EGRESS_FAILED
    mock_data.egress_info.error = "could not connect to the room"
    mock_data.egress_info.error_code = 500

    with caplog.at_level(logging.ERROR), pytest.raises(RuntimeError):
        service._handle_egress_ended(mock_data)

    assert (
        f"Recording worker reported failed for recording {recording.id}" in caplog.text
    )
    assert "could not connect to the room" in caplog.text


def test_egress_status_mapping_covers_every_livekit_status():
    """Every egress status LiveKit can report must translate to a recording event."""

    unmapped = [
        name
        for name in EgressStatus.keys()
        if getattr(EgressStatus, name) not in EGRESS_STATUS_TO_RECORDING_EVENT
    ]

    assert not unmapped


@pytest.mark.parametrize(
    ("egress_status", "expected_event"),
    (
        (EgressStatus.EGRESS_STARTING, RecordingWorkerEvent.STARTING),
        (EgressStatus.EGRESS_ACTIVE, RecordingWorkerEvent.STARTED),
        (EgressStatus.EGRESS_ENDING, RecordingWorkerEvent.SAVING),
        (EgressStatus.EGRESS_COMPLETE, RecordingWorkerEvent.COMPLETED),
        (EgressStatus.EGRESS_LIMIT_REACHED, RecordingWorkerEvent.LIMIT_REACHED),
        (EgressStatus.EGRESS_ABORTED, RecordingWorkerEvent.ABORTED),
        (EgressStatus.EGRESS_FAILED, RecordingWorkerEvent.FAILED),
    ),
)
def test_to_recording_event_translates_egress_status(egress_status, expected_event):
    """Should translate a LiveKit egress status into a recording worker event."""

    assert to_recording_event(egress_status) == expected_event


def test_to_recording_event_returns_none_on_unmapped_status(caplog):
    """Should warn and return None when LiveKit reports an unknown status."""

    with caplog.at_level(logging.WARNING):
        event = to_recording_event(999)

    assert event is None
    assert "Unmapped LiveKit egress status" in caplog.text


recording_filename = f"recordings/{fake.file_name(extension='ogg')}"

UPLOADED_FILE = api.FileInfo(
    filename=recording_filename,
    location=f"https://storage.example.com/{recording_filename}",
    size=1048576,
)
NOT_UPLOADED_FILE = api.FileInfo(filename=recording_filename)

ROOM_CONNECTION_FAILED = {
    "status": EgressStatus.EGRESS_FAILED,
    "error": EGRESS_ROOM_CONNECTION_FAILED_ERROR,
    "error_code": 503,
    "details": "End reason: Source closed",
}
CPU_EXHAUSTED_DRAINED = {
    "status": EgressStatus.EGRESS_COMPLETE,
    "details": EGRESS_CPU_EXHAUSTED_DETAILS,
}
CPU_EXHAUSTED_KILLED = {
    "status": EgressStatus.EGRESS_FAILED,
    "error": "CPU exhausted: 8.5 cores used",
    "error_code": 403,
    "details": EGRESS_CPU_EXHAUSTED_DETAILS,
}


@pytest.mark.parametrize(
    ("egress_info", "expected_event"),
    (
        (
            api.EgressInfo(**ROOM_CONNECTION_FAILED, file_results=[UPLOADED_FILE]),
            RecordingWorkerEvent.INTERRUPTED,
        ),
        (
            api.EgressInfo(**ROOM_CONNECTION_FAILED, file_results=[NOT_UPLOADED_FILE]),
            RecordingWorkerEvent.FAILED,
        ),
        (
            api.EgressInfo(**CPU_EXHAUSTED_DRAINED, file_results=[UPLOADED_FILE]),
            RecordingWorkerEvent.INTERRUPTED,
        ),
        (
            api.EgressInfo(**CPU_EXHAUSTED_KILLED, file_results=[UPLOADED_FILE]),
            RecordingWorkerEvent.INTERRUPTED,
        ),
        (
            api.EgressInfo(**CPU_EXHAUSTED_KILLED, file_results=[NOT_UPLOADED_FILE]),
            RecordingWorkerEvent.FAILED,
        ),
        # Other failures stay failures, even with an uploaded file.
        (
            api.EgressInfo(
                status=EgressStatus.EGRESS_FAILED,
                error="pipeline frozen",
                error_code=500,
                details="End reason: Source closed",
                file_results=[UPLOADED_FILE],
            ),
            RecordingWorkerEvent.FAILED,
        ),
        (
            api.EgressInfo(
                status=EgressStatus.EGRESS_COMPLETE,
                details="End reason: StopEgress API",
                file_results=[UPLOADED_FILE],
            ),
            RecordingWorkerEvent.COMPLETED,
        ),
        (
            api.EgressInfo(
                status=EgressStatus.EGRESS_ABORTED,
                error="Stop called before pipeline could start",
                error_code=412,
                details="End reason: StopEgress API",
            ),
            RecordingWorkerEvent.ABORTED,
        ),
        (
            api.EgressInfo(
                status=EgressStatus.EGRESS_LIMIT_REACHED,
                error="Session limit reached",
                error_code=413,
                details="End reason: Session limit reached",
                file_results=[UPLOADED_FILE],
            ),
            RecordingWorkerEvent.LIMIT_REACHED,
        ),
    ),
)
def test_to_ended_recording_event_translates_egress_info(egress_info, expected_event):
    """Should tell an egress cut short with a partial file apart from the others."""

    assert to_ended_recording_event(egress_info) == expected_event


@pytest.mark.parametrize(
    ("mode", "egress_info_kwargs", "notification_type"),
    (
        ("transcript", ROOM_CONNECTION_FAILED, "transcriptionInterrupted"),
        ("transcript", CPU_EXHAUSTED_DRAINED, "transcriptionInterrupted"),
        ("screen_recording", CPU_EXHAUSTED_DRAINED, "screenRecordingInterrupted"),
        ("screen_recording", CPU_EXHAUSTED_KILLED, "screenRecordingInterrupted"),
    ),
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_interrupted_saves_partial_recording(  # noqa: PLR0913, PLR0917
    mock_update_metadata,
    mock_notify,
    mock_notify_external_services,
    mode,
    egress_info_kwargs,
    notification_type,
    service,
    caplog,
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Should save an interrupted recording and tell participants it is partial."""

    mock_notify_external_services.return_value = True

    recording = RecordingFactory(worker_id="worker-1", mode=mode, status="active")
    data = api.WebhookEvent(
        event="egress_ended",
        egress_info=api.EgressInfo(
            egress_id=recording.worker_id,
            file_results=[UPLOADED_FILE],
            **egress_info_kwargs,
        ),
    )

    with caplog.at_level(logging.WARNING):
        service._handle_egress_ended(data)

    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id),
        notification_data={"type": notification_type},
        cluster=get_default_livekit_cluster(),
    )
    mock_notify_external_services.assert_called_once_with(recording)
    mock_update_metadata.assert_called_once_with(
        str(recording.room.id),
        remove_keys=["recording_mode", "recording_status"],
        cluster=get_default_livekit_cluster(),
    )
    assert (
        f"Recording worker reported interrupted for recording {recording.id}"
        in caplog.text
    )

    recording.refresh_from_db()

    assert recording.status == "notification_succeeded"


@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_interrupted_after_stop_does_not_notify_participants(
    mock_update_metadata, mock_notify, mock_notify_external_services, service
):
    """Shouldn't notify participants about a recording they already stopped."""

    mock_notify_external_services.return_value = False

    recording = RecordingFactory(worker_id="worker-1", status="stopped")
    data = api.WebhookEvent(
        event="egress_ended",
        egress_info=api.EgressInfo(
            egress_id=recording.worker_id,
            file_results=[UPLOADED_FILE],
            **CPU_EXHAUSTED_DRAINED,
        ),
    )

    service._handle_egress_ended(data)

    mock_notify.assert_not_called()
    mock_notify_external_services.assert_called_once_with(recording)

    recording.refresh_from_db()

    assert recording.status == "saved"


@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_failed_on_another_error_discards_recording(
    mock_update_metadata, mock_notify, service
):
    """Should still flag as failed an egress that failed for another reason."""

    recording = RecordingFactory(
        worker_id="worker-1", mode="transcript", status="active"
    )
    data = api.WebhookEvent(
        event="egress_ended",
        egress_info=api.EgressInfo(
            egress_id=recording.worker_id,
            status=EgressStatus.EGRESS_FAILED,
            error="pipeline frozen",
            error_code=500,
            details="End reason: Source closed",
            file_results=[UPLOADED_FILE],
        ),
    )

    service._handle_egress_ended(data)

    mock_notify.assert_called_once_with(
        room_name=str(recording.room.id),
        notification_data={"type": "transcriptionFailed"},
        cluster=get_default_livekit_cluster(),
    )

    recording.refresh_from_db()

    assert recording.status == "failed"


@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_updated_ignores_unmapped_status(mock_update_metadata, service):
    """Shouldn't touch the room's metadata when the egress status is unknown."""

    RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = "worker-1"
    mock_data.egress_info.status = 999

    service._handle_egress_updated(mock_data)

    mock_update_metadata.assert_not_called()


@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_handle_room_finished_clears_cache_and_deletes_dispatch_rule(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should clear lobby cache and delete SIP dispatch rule when room finishes."""
    settings.ROOM_TELEPHONY_ENABLED = True
    mock_room_name = uuid.uuid4()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(mock_room_name)

    service._handle_room_finished(mock_data)

    mock_delete_dispatch_rule.assert_called_once_with(mock_room_name)
    mock_clear_cache.assert_called_once_with(mock_room_name)


@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_handle_room_finished_deletes_dispatch_rule_when_only_roomkit_enabled(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should delete dispatch rule when only roomkit is enabled when room finishes."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = True
    mock_room_name = uuid.uuid4()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(mock_room_name)

    service._handle_room_finished(mock_data)

    mock_delete_dispatch_rule.assert_called_once_with(mock_room_name)
    mock_clear_cache.assert_called_once_with(mock_room_name)


@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_handle_room_finished_skips_telephony_when_disabled(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should clear lobby cache but skip dispatch rule deletion when telephony is disabled."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    mock_room_name = uuid.uuid4()
    mock_data = mock.MagicMock()
    mock_data.room.name = str(mock_room_name)

    service._handle_room_finished(mock_data)

    mock_delete_dispatch_rule.assert_not_called()
    mock_clear_cache.assert_called_once_with(mock_room_name)


@mock.patch.object(
    LobbyService, "clear_room_cache", side_effect=Exception("Test error")
)
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_handle_room_finished_raises_error_when_cache_clearing_fails(
    mock_delete_dispatch_rule, mock_clear_cache, service, settings
):
    """Should raise ActionFailedError when lobby cache clearing fails when room finishes."""
    settings.ROOM_TELEPHONY_ENABLED = True
    mock_data = mock.MagicMock()
    mock_data.room.name = "00000000-0000-0000-0000-000000000000"

    expected_error = (
        "Failed to clear room cache for room 00000000-0000-0000-0000-000000000000"
    )

    with pytest.raises(ActionFailedError, match=expected_error):
        service._handle_room_finished(mock_data)

    mock_delete_dispatch_rule.assert_called_once_with(
        uuid.UUID("00000000-0000-0000-0000-000000000000")
    )


@mock.patch.object(PresenceCache, "clear_room")
@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(
    SIPManagement,
    "delete_dispatch_rule",
    side_effect=SIPException("Test error"),
)
def test_handle_room_finished_raises_error_when_telephony_deletion_fails(
    mock_delete_dispatch_rule, mock_clear_cache, mock_clear_presence, service, settings
):
    """Should raise ActionFailedError when dispatch rule deletion fails when room
    finishes, once its presence and lobby caches are cleared all the same."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room_id = uuid.UUID("00000000-0000-0000-0000-000000000000")
    mock_data = mock.MagicMock()
    mock_data.room.name = str(room_id)

    expected_error = (
        "Failed to delete sip dispatch rule for room "
        "00000000-0000-0000-0000-000000000000"
    )

    with pytest.raises(ActionFailedError, match=expected_error) as raised:
        service._handle_room_finished(mock_data)

    assert isinstance(raised.value.__cause__, SIPException)
    mock_delete_dispatch_rule.assert_called_once_with(room_id)
    mock_clear_presence.assert_called_once_with(room_id)
    mock_clear_cache.assert_called_once_with(room_id)


@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_handle_room_finished_ignores_an_unregistered_room(
    mock_delete_dispatch_rule, service, room_cleanup, settings, caplog
):
    """A LiveKit room not named after a room, such as an unregistered room, is
    not cleaned up, and its event is acknowledged rather than retried."""
    settings.ROOM_TELEPHONY_ENABLED = True
    mock_data = mock.MagicMock()
    mock_data.room.name = "my-unregistered-room"

    with caplog.at_level(logging.INFO, logger="core.services.livekit_events"):
        service._handle_room_finished(mock_data)

    assert "room name 'my-unregistered-room' is not a valid UUID" in caplog.text
    mock_delete_dispatch_rule.assert_not_called()
    for cleanup in room_cleanup:
        cleanup.assert_not_called()


@mock.patch.object(PresenceCache, "clear_room")
@mock.patch.object(LobbyService, "clear_room_cache")
@mock.patch.object(SIPManagement, "delete_dispatch_rule")
def test_clean_up_room(
    mock_delete_dispatch_rule, mock_clear_cache, mock_clear_presence, service, settings
):
    """A room is cleaned up without any webhook, by its id: its SIP dispatch
    rule is deleted, then its presence and lobby caches are cleared."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room_id = uuid.uuid4()
    calls = mock.Mock()
    calls.attach_mock(mock_delete_dispatch_rule, "delete_dispatch_rule")
    calls.attach_mock(mock_clear_presence, "clear_presence")
    calls.attach_mock(mock_clear_cache, "clear_lobby")

    service.clean_up_room(room_id)

    assert calls.mock_calls == [
        mock.call.delete_dispatch_rule(room_id),
        mock.call.clear_presence(room_id),
        mock.call.clear_lobby(room_id),
    ]


@mock.patch.object(PresenceCache, "clear_room")
@mock.patch.object(
    LobbyService, "clear_room_cache", side_effect=Exception("Redis is down")
)
@mock.patch.object(
    SIPManagement,
    "delete_dispatch_rule",
    side_effect=SIPException("Test error"),
)
def test_clean_up_room_telephony_deletion_and_cache_clearing_fail(
    mock_delete_dispatch_rule, mock_clear_cache, mock_clear_presence, service, settings
):
    """A room whose SIP dispatch rule cannot be deleted, and whose lobby cache
    cannot be cleared either, fails on its lobby cache, once its presence is
    cleared: the failure of its SIP dispatch rule comes first in the chain."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room_id = uuid.uuid4()

    with pytest.raises(
        ActionFailedError, match=f"Failed to clear room cache for room {room_id}"
    ) as raised:
        service.clean_up_room(room_id)

    assert str(raised.value.__cause__) == "Redis is down"
    assert str(raised.value.__cause__.__context__) == (
        f"Failed to delete sip dispatch rule for room {room_id}"
    )
    mock_delete_dispatch_rule.assert_called_once_with(room_id)
    mock_clear_presence.assert_called_once_with(room_id)
    mock_clear_cache.assert_called_once_with(room_id)


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
def test_handle_room_started_creates_dispatch_rule_successfully(
    mock_ensure_dispatch_rule, service, settings
):
    """Should ensure the SIP dispatch rule exists when room starts successfully."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    data = room_started(str(room.id))

    service._handle_room_started(data)

    mock_ensure_dispatch_rule.assert_called_once_with(room)


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
def test_handle_room_started_creates_dispatch_rule_when_only_roomkit_enabled(
    mock_ensure_dispatch_rule, service, settings
):
    """Should ensure the dispatch rule exists when only roomkit is enabled during room start."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = True
    room = RoomFactory()
    data = room_started(str(room.id))

    service._handle_room_started(data)

    mock_ensure_dispatch_rule.assert_called_once_with(room)


@mock.patch.object(SIPManagement, "ensure_dispatch_rule", return_value=False)
def test_handle_room_started_ignores_existing_dispatch_rule(
    mock_ensure_dispatch_rule, service, settings
):
    """Should proceed silently when the dispatch rule already exists when room starts."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    data = room_started(str(room.id))

    # ensure_dispatch_rule reports the rule as pre-existing: nothing to raise
    service._handle_room_started(data)

    mock_ensure_dispatch_rule.assert_called_once_with(room)


@mock.patch.object(
    SIPManagement,
    "ensure_dispatch_rule",
    side_effect=SIPException("Test error"),
)
def test_handle_room_started_raises_error_when_dispatch_rule_creation_fails(
    mock_ensure_dispatch_rule, service, settings
):
    """Should raise ActionFailedError when ensuring the dispatch rule fails when room starts."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    data = room_started(str(room.id))

    expected_error = f"Failed to create sip dispatch rule for room {room.id}"

    with pytest.raises(ActionFailedError, match=expected_error):
        service._handle_room_started(data)


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
def test_handle_room_started_skips_dispatch_rule_when_telephony_disabled(
    mock_ensure_dispatch_rule, service, settings
):
    """Should skip ensuring the SIP dispatch rule when telephony is disabled during room start."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    room = RoomFactory()
    data = room_started(str(room.id))

    service._handle_room_started(data)

    mock_ensure_dispatch_rule.assert_not_called()


def test_handle_room_started_records_access(service, settings):
    """Should record the access on a room that is started for the first time."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    room = RoomFactory()
    other_room = RoomFactory()
    data = room_started(str(room.id))

    now = timezone.now()
    with mock.patch("django.utils.timezone.now", return_value=now):
        service._handle_room_started(data)

    room.refresh_from_db()
    assert room.last_started_at == now

    other_room.refresh_from_db()
    assert other_room.last_started_at is None


def test_handle_room_started_overwrites_previous_access(service, settings):
    """Should overwrite the previous access each time the room is started again."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    now = timezone.now()
    room = RoomFactory(last_started_at=now - timedelta(days=30))
    data = room_started(str(room.id))

    with mock.patch("django.utils.timezone.now", return_value=now):
        service._handle_room_started(data)

    room.refresh_from_db()
    assert room.last_started_at == now


def test_handle_room_started_only_updates_access(service, settings):
    """Should leave the slug and the update date untouched when recording the access."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    room = RoomFactory()
    Room.objects.filter(pk=room.pk).update(slug="𓆑")
    room.refresh_from_db()
    updated_at = room.updated_at
    data = room_started(str(room.id))

    service._handle_room_started(data)

    room.refresh_from_db()
    assert room.last_started_at is not None
    assert room.slug == "𓆑"
    assert room.updated_at == updated_at


@mock.patch.object(
    SIPManagement,
    "ensure_dispatch_rule",
    side_effect=SIPException("Test error"),
)
def test_handle_room_started_records_access_when_dispatch_rule_creation_fails(
    mock_ensure_dispatch_rule, service, settings
):
    """Should still record the access when ensuring the dispatch rule fails."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    data = room_started(str(room.id))

    with pytest.raises(ActionFailedError):
        service._handle_room_started(data)

    room.refresh_from_db()
    assert room.last_started_at is not None


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
@mock.patch("core.services.room_management.RoomManagement.delete_room")
def test_handle_room_started_ignores_an_unregistered_room(
    mock_delete_room, mock_ensure_dispatch_rule, service, settings, caplog
):
    """A LiveKit room not named after a room, such as an unregistered room, is
    left alone, and its event is acknowledged rather than retried."""
    settings.ROOM_TELEPHONY_ENABLED = True
    data = room_started("my-unregistered-room")

    with caplog.at_level(logging.INFO, logger="core.services.livekit_events"):
        service._handle_room_started(data)

    assert "room name 'my-unregistered-room' is not a valid UUID" in caplog.text
    mock_delete_room.assert_not_called()
    mock_ensure_dispatch_rule.assert_not_called()


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
@mock.patch("core.services.room_management.RoomManagement.delete_room")
def test_handle_room_started_ignores_an_unknown_room(
    mock_delete_room, mock_ensure_dispatch_rule, service, settings, caplog
):
    """A LiveKit room named after a room that does not exist is left alone, and
    its event is acknowledged rather than retried."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room_id = uuid.uuid4()
    data = room_started(str(room_id))

    with caplog.at_level(logging.INFO, logger="core.services.livekit_events"):
        service._handle_room_started(data)

    assert f"room {room_id} does not exist" in caplog.text
    mock_delete_room.assert_not_called()
    mock_ensure_dispatch_rule.assert_not_called()


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
@mock.patch("core.services.room_management.RoomManagement.delete_room")
def test_handle_room_started_closes_deleted_room(
    mock_delete_room, mock_ensure_dispatch_rule, service, settings
):
    """Should close a LiveKit room recreated for a soft-deleted room."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    room.soft_delete()
    data = room_started(str(room.id))

    service._handle_room_started(data)

    mock_delete_room.assert_called_once_with(
        str(room.id), cluster=get_default_livekit_cluster()
    )
    mock_ensure_dispatch_rule.assert_not_called()


@mock.patch(
    "core.services.room_management.RoomManagement.delete_room",
    side_effect=RoomNotFoundException("Room does not exist"),
)
def test_handle_room_started_ignores_already_closed_deleted_room(
    mock_delete_room, service
):
    """Should proceed silently when the deleted room is already closed in LiveKit."""
    room = RoomFactory()
    room.soft_delete()
    data = room_started(str(room.id))

    service._handle_room_started(data)

    mock_delete_room.assert_called_once_with(
        str(room.id), cluster=get_default_livekit_cluster()
    )


@mock.patch(
    "core.services.room_management.RoomManagement.delete_room",
    side_effect=RoomManagementException("Could not delete room"),
)
def test_handle_room_started_raises_error_when_closing_deleted_room_fails(
    mock_delete_room, service
):
    """Should raise ActionFailedError when the deleted room cannot be closed."""
    room = RoomFactory()
    room.soft_delete()
    data = room_started(str(room.id))

    expected_error = f"Failed to close deleted room {room.id}"

    with pytest.raises(ActionFailedError, match=expected_error):
        service._handle_room_started(data)


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
def test_record_room_start(mock_ensure_dispatch_rule, service, settings):
    """The start of a room is recorded without any webhook: when it last
    started, and its SIP dispatch rule, ensured."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    other_room = RoomFactory()

    now = timezone.now()
    with mock.patch("django.utils.timezone.now", return_value=now):
        service.record_room_start(room)

    room.refresh_from_db()
    assert room.last_started_at == now
    other_room.refresh_from_db()
    assert other_room.last_started_at is None
    mock_ensure_dispatch_rule.assert_called_once_with(room)


@mock.patch.object(
    SIPManagement,
    "ensure_dispatch_rule",
    side_effect=SIPException("Test error"),
)
def test_record_room_start_dispatch_rule_failure(
    mock_ensure_dispatch_rule, service, settings
):
    """Failing to ensure the SIP dispatch rule of a room raises, once its start
    is recorded."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()

    with pytest.raises(
        ActionFailedError,
        match=f"Failed to create sip dispatch rule for room {room.id}",
    ):
        service.record_room_start(room)

    room.refresh_from_db()
    assert room.last_started_at is not None


@mock.patch("core.services.room_management.RoomManagement.delete_room")
def test_close_deleted_room_on_a_cluster(
    mock_delete_room, two_livekit_clusters, service, caplog
):
    """The LiveKit room of a deleted room is closed on the cluster given,
    whichever cluster sent the last webhook, if any."""
    _paris, lyon = two_livekit_clusters
    room_id = uuid.uuid4()

    with caplog.at_level(logging.WARNING, logger="core.services.livekit_events"):
        service.close_deleted_room(room_id, cluster=lyon)

    mock_delete_room.assert_called_once_with(str(room_id), cluster=lyon)
    assert f"LiveKit room {room_id} started for a deleted room" in caplog.text


@mock.patch(
    "core.services.room_management.RoomManagement.delete_room",
    side_effect=RoomManagementException("Could not delete room"),
)
def test_close_deleted_room_failure(mock_delete_room, two_livekit_clusters, service):
    """A cluster failing to close the LiveKit room of a deleted room raises."""
    _paris, lyon = two_livekit_clusters
    room_id = uuid.uuid4()

    with pytest.raises(
        ActionFailedError, match=f"Failed to close deleted room {room_id}"
    ):
        service.close_deleted_room(room_id, cluster=lyon)

    mock_delete_room.assert_called_once_with(str(room_id), cluster=lyon)


def test_handle_room_started_records_the_sid(service, settings):
    """A LiveKit room started on the cluster its room is placed on, the SID of
    its LiveKit room not known yet, has its SID recorded, and the start of its
    room is recorded."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    room = RoomFactory()
    placement = Placement.objects.create(
        room_name=str(room.id), room=room, cluster="default"
    )

    service._handle_room_started(room_started(str(room.id)))

    recorded = Placement.objects.get()
    assert recorded.pk == placement.pk
    assert recorded.sid == SID
    room.refresh_from_db()
    assert room.last_started_at is not None


def test_handle_room_started_places_the_livekit_room(service, settings):
    """A LiveKit room started without placement is placed on the cluster it
    started on, with its SID, named after its room, and the start of its room
    is recorded."""
    settings.ROOM_TELEPHONY_ENABLED = False
    settings.ROOMKIT_ENABLED = False
    room = RoomFactory()

    service._handle_room_started(room_started(str(room.id)))

    placement = Placement.objects.get()
    assert placement.room_name == str(room.id)
    assert placement.room == room
    assert placement.cluster == "default"
    assert placement.sid == SID
    room.refresh_from_db()
    assert room.last_started_at is not None


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
def test_handle_room_started_keeps_the_sid_recorded(
    mock_ensure_dispatch_rule, service, settings
):
    """A LiveKit room started on the cluster its room is placed on, with another
    SID than the one recorded, leaves the placement as it is: the start of its
    room is recorded all the same, and its SIP dispatch rule ensured."""
    settings.ROOM_TELEPHONY_ENABLED = True
    room = RoomFactory()
    Placement.objects.create(
        room_name=str(room.id), room=room, cluster="default", sid=OTHER_SID
    )

    service._handle_room_started(room_started(str(room.id)))

    assert Placement.objects.get().sid == OTHER_SID
    room.refresh_from_db()
    assert room.last_started_at is not None
    mock_ensure_dispatch_rule.assert_called_once_with(room)


@mock.patch.object(
    PlacementService,
    "record_started",
    side_effect=PlacementChangedError("The placement kept changing."),
)
def test_handle_room_started_raises_error_when_the_placement_keeps_changing(
    mock_record_started, service
):
    """Should raise ActionFailedError when the placement of the LiveKit room
    started keeps changing while it is recorded, for LiveKit to send the event
    again."""
    room = RoomFactory()

    with pytest.raises(
        ActionFailedError,
        match=f"Failed to record LiveKit room {room.id} started on LiveKit cluster "
        "default",
    ):
        service._handle_room_started(room_started(str(room.id)))

    mock_record_started.assert_called_once()
    room.refresh_from_db()
    assert room.last_started_at is None


@mock.patch.object(
    api.WebhookReceiver, "receive", side_effect=Exception("Invalid payload")
)
def test_receive_invalid_payload(mock_receive, service):
    """Should raise InvalidPayloadError for invalid payloads."""
    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    with pytest.raises(InvalidPayloadError, match="Invalid webhook payload"):
        service.receive(mock_request)


def test_receive_missing_auth(service):
    """Should raise AuthenticationError when auth header is missing."""
    mock_request = mock.MagicMock()
    mock_request.headers = {}

    with pytest.raises(AuthenticationError, match="Authorization header missing"):
        service.receive(mock_request)


@mock.patch.object(api.WebhookReceiver, "receive")
def test_receive_unknown_event_is_acknowledged(mock_receive, service, caplog):
    """Unknown event types are logged and ignored, not rejected.

    LiveKit adds event types over time and does not retry 4xx responses, so
    raising here would silently drop the event.
    """
    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = str(uuid.uuid4())
    mock_data.event = "some_future_event"
    mock_receive.return_value = mock_data

    with caplog.at_level("WARNING", logger="core.services.livekit_events"):
        service.receive(mock_request)  # must not raise

    assert "Ignoring unknown LiveKit webhook event type 'some_future_event'" in (
        caplog.text
    )


@mock.patch.object(api.WebhookReceiver, "receive")
@mock.patch.object(LiveKitEventsService, "_handle_room_started")
def test_receive_no_filter_processes_all_events(
    mock_handle_room_started, mock_receive, mock_livekit_config, settings
):
    """Should process all events when filter regex is not configured."""
    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX = None

    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = "!JIfCxVLcKKkWrmVBOb:your-domain.com"
    mock_data.event = "room_started"
    mock_receive.return_value = mock_data

    service = LiveKitEventsService()
    service.receive(mock_request)

    mock_handle_room_started.assert_called_once()


@mock.patch.object(api.WebhookReceiver, "receive")
@mock.patch.object(LiveKitEventsService, "_handle_room_started")
def test_receive_invalid_filter_regex_processes_all_events(
    mock_handle_room_started, mock_receive, mock_livekit_config, settings
):
    """Should process all events when filter regex is invalid (fail-safe)."""
    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX = "(abc"

    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = "!JIfCxVLcKKkWrmVBOb:your-domain.com"
    mock_data.event = "room_started"
    mock_receive.return_value = mock_data

    service = LiveKitEventsService()
    service.receive(mock_request)

    mock_handle_room_started.assert_called_once()


@mock.patch.object(api.WebhookReceiver, "receive")
@mock.patch.object(LiveKitEventsService, "_handle_room_started")
def test_receive_filter_drops_non_matching_events(
    mock_handle_room_started, mock_receive, mock_livekit_config, settings
):
    """Should drop events when room name does not match filter regex."""
    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX = (
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    )

    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = "!JIfCxVLcKKkWrmVBOb:your-domain.com"
    mock_data.event = "room_started"
    mock_receive.return_value = mock_data

    service = LiveKitEventsService()
    service.receive(mock_request)

    mock_handle_room_started.assert_not_called()


@mock.patch.object(api.WebhookReceiver, "receive")
@mock.patch.object(LiveKitEventsService, "_handle_room_started")
def test_receive_filter_processes_matching_events(
    mock_handle_room_started, mock_receive, mock_livekit_config, settings
):
    """Should process events when room name matches filter regex."""
    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX = (
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    )

    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = str(uuid.uuid4())
    mock_data.event = "room_started"
    mock_receive.return_value = mock_data

    service = LiveKitEventsService()
    service.receive(mock_request)

    mock_handle_room_started.assert_called_once()


def test_get_followed_rooms(mock_livekit_config, settings, django_assert_num_queries):
    """
    LiveKit rooms are filtered as their webhooks are: connection test rooms,
    those the filter regex leaves out and those not named after a UUID are
    left out. The others are mapped to the room they are named after, soft
    deleted rooms included, or to None when no room has that id, all read in
    one query.
    """
    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX = r"^[0-9a-z-]+$"
    room, deleted_room, test_room, filtered_room = RoomFactory.create_batch(4)
    deleted_room.soft_delete()
    settings.CONNECTION_TEST_ROOM_PREFIX = str(test_room.id)
    unknown_room_name = str(uuid.uuid4())
    service = LiveKitEventsService()

    with django_assert_num_queries(1):
        followed = service.get_followed_rooms(
            [
                str(room.id),
                str(deleted_room.id),
                unknown_room_name,
                "my-unregistered-room",
                str(test_room.id),
                str(filtered_room.id).upper(),
            ]
        )

    assert followed == {
        str(room.id): room,
        str(deleted_room.id): deleted_room,
        unknown_room_name: None,
    }
    assert followed[str(deleted_room.id)].is_deleted


def test_get_followed_rooms_none(service, django_assert_num_queries):
    """Without any LiveKit room named after a UUID, no room is read."""
    with django_assert_num_queries(0):
        assert service.get_followed_rooms(["my-unregistered-room"]) == {}


@mock.patch.object(api.WebhookReceiver, "receive")
@mock.patch.object(LiveKitEventsService, "_handle_room_finished")
@mock.patch.object(LiveKitEventsService, "_handle_room_started")
def test_receive_ignores_connection_test_room(
    mock_handle_room_started,
    mock_handle_room_finished,
    mock_receive,
    mock_livekit_config,
    settings,
):
    """Should ignore all webhook events for connection test rooms in receive()."""

    settings.CONNECTION_TEST_ROOM_PREFIX = "connection-test"

    mock_request = mock.MagicMock()
    mock_request.headers = {"Authorization": "test_token"}
    mock_request.body = b"{}"

    mock_data = mock.MagicMock()
    mock_data.room.name = f"{settings.CONNECTION_TEST_ROOM_PREFIX}-{uuid.uuid4()}"
    mock_data.event = "room_started"
    mock_receive.return_value = mock_data

    service = LiveKitEventsService()
    service.receive(mock_request)

    mock_handle_room_started.assert_not_called()
    mock_handle_room_finished.assert_not_called()


@mock.patch("core.services.room_management.RoomManagement.delete_room")
def test_receive_room_started_closes_a_deleted_room_on_its_cluster(
    mock_delete_room, two_livekit_clusters
):
    """A LiveKit room started for a deleted room is closed on the cluster that
    sent the webhook, and not placed."""
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    room.soft_delete()

    LiveKitEventsService().receive(
        room_event_request(lyon, "room_started", str(room.id))
    )

    mock_delete_room.assert_called_once_with(str(room.id), cluster=lyon)
    assert not Placement.objects.exists()


@mock.patch.object(SIPManagement, "ensure_dispatch_rule")
@mock.patch("core.services.room_management.RoomManagement.delete_room")
def test_receive_room_started_on_another_cluster_closes_it(
    mock_delete_room, mock_ensure_dispatch_rule, two_livekit_clusters, settings
):
    """A LiveKit room started on a cluster other than the one its room is
    placed on is closed there: neither is the start of its room recorded, nor
    is its SIP dispatch rule ensured. The placement is left as it is."""
    settings.ROOM_TELEPHONY_ENABLED = True
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    Placement.objects.create(
        room_name=str(room.id), room=room, cluster="paris", sid=OTHER_SID
    )

    LiveKitEventsService().receive(
        room_event_request(lyon, "room_started", str(room.id))
    )

    mock_delete_room.assert_called_once_with(str(room.id), cluster=lyon)
    placement = Placement.objects.get()
    assert placement.cluster == "paris"
    assert placement.sid == OTHER_SID
    room.refresh_from_db()
    assert room.last_started_at is None
    mock_ensure_dispatch_rule.assert_not_called()


@mock.patch(
    "core.services.room_management.RoomManagement.delete_room",
    side_effect=RoomManagementException("Could not delete room"),
)
def test_receive_room_started_on_another_cluster_close_failure(
    mock_delete_room, two_livekit_clusters
):
    """Should raise ActionFailedError when a LiveKit room started on a cluster
    other than the one its room is placed on cannot be closed there, for
    LiveKit to send the event again."""
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()
    Placement.objects.create(
        room_name=str(room.id), room=room, cluster="paris", sid=OTHER_SID
    )

    with pytest.raises(
        ActionFailedError,
        match=f"Failed to record LiveKit room {room.id} started on LiveKit cluster "
        "lyon",
    ):
        LiveKitEventsService().receive(
            room_event_request(lyon, "room_started", str(room.id))
        )

    mock_delete_room.assert_called_once_with(str(room.id), cluster=lyon)
    room.refresh_from_db()
    assert room.last_started_at is None


@mock.patch("core.services.room_management.RoomManagement.delete_room")
def test_receive_room_started_from_a_cluster_weighing_zero(mock_delete_room, settings):
    """A LiveKit room started without placement on a cluster that may not
    receive new placements is closed there, and not placed: the meeting its
    participants were in had ended."""
    settings.LIVEKIT_CLUSTERS = json.dumps(
        [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon", weight=0)]
    )
    _paris, lyon = get_livekit_clusters()
    room = RoomFactory()

    LiveKitEventsService().receive(
        room_event_request(lyon, "room_started", str(room.id))
    )

    mock_delete_room.assert_called_once_with(str(room.id), cluster=lyon)
    assert not Placement.objects.exists()
    room.refresh_from_db()
    assert room.last_started_at is None


def test_receive_room_started_then_finished_without_placement(
    two_livekit_clusters, room_cleanup
):
    """A LiveKit room started without placement is placed on its cluster, and
    the placement deleted when it finishes, its room then cleaned up."""
    _paris, lyon = two_livekit_clusters
    room = RoomFactory()

    LiveKitEventsService().receive(
        room_event_request(lyon, "room_started", str(room.id))
    )

    placement = Placement.objects.get()
    assert placement.cluster == "lyon"
    assert placement.sid == SID
    for cleanup in room_cleanup:
        cleanup.assert_not_called()

    LiveKitEventsService().receive(
        room_event_request(lyon, "room_finished", str(room.id))
    )

    assert not Placement.objects.exists()
    for cleanup in room_cleanup:
        cleanup.assert_called_once_with(room.id)


def test_receive_room_finished_deletes_the_placement(
    two_livekit_clusters, room_cleanup
):
    """A LiveKit room that finished on the cluster and with the SID of its
    placement deletes it, and its room is cleaned up."""
    _paris, lyon = two_livekit_clusters
    room_id = uuid.uuid4()
    Placement.objects.create(room_name=str(room_id), cluster="lyon", sid=SID)
    Placement.objects.create(room_name="other-room", cluster="lyon", sid=SID)

    LiveKitEventsService().receive(
        room_event_request(lyon, "room_finished", str(room_id))
    )

    assert list(Placement.objects.values_list("room_name", flat=True)) == ["other-room"]
    for cleanup in room_cleanup:
        cleanup.assert_called_once_with(room_id)


@pytest.mark.parametrize(
    ("cluster", "sid"),
    (("paris", SID), ("lyon", OTHER_SID), ("lyon", "")),
)
def test_receive_room_finished_elsewhere_than_placed(
    cluster, sid, two_livekit_clusters, room_cleanup, caplog
):
    """A LiveKit room that finished on another cluster or with another SID than
    its placement's leaves the placement and the room as they are.

    The placement points at the LiveKit room the room now uses, where
    participants admitted from the lobby must not be queued again.
    """
    _paris, lyon = two_livekit_clusters
    room_id = uuid.uuid4()
    placement = Placement.objects.create(
        room_name=str(room_id), cluster=cluster, sid=sid
    )

    with caplog.at_level(logging.INFO, logger="core.services.livekit_events"):
        LiveKitEventsService().receive(
            room_event_request(lyon, "room_finished", str(room_id))
        )

    kept_placement = Placement.objects.get()
    assert kept_placement.pk == placement.pk
    assert kept_placement.cluster == cluster
    assert kept_placement.sid == sid
    for cleanup in room_cleanup:
        cleanup.assert_not_called()
    assert (
        f"LiveKit room {room_id} finished on LiveKit cluster lyon with SID {SID}, "
        f"but is placed on LiveKit cluster {cluster} with SID {sid!r}: ignoring "
        "the event"
    ) in caplog.text


@mock.patch("core.services.room_management.RoomManagement.delete_room")
def test_receive_room_finished_after_a_relocation(
    mock_delete_room, two_livekit_clusters, room_cleanup, caplog
):
    """The LiveKit room a room was relocated from, finishing on the cluster it
    left with the SID it had there, leaves the placement on the new cluster and
    the room as they are: participants admitted from the lobby, reconnecting on
    the new cluster, must not be queued again."""
    paris, _lyon = two_livekit_clusters
    room_id = uuid.uuid4()
    Placement.objects.create(room_name=str(room_id), cluster="paris", sid=SID)
    PlacementService.relocate(str(room_id), "lyon", actor=None)
    mock_delete_room.assert_called_once_with(str(room_id), cluster=paris)
    relocated = Placement.objects.get()

    with caplog.at_level(logging.INFO, logger="core.services.livekit_events"):
        LiveKitEventsService().receive(
            room_event_request(paris, "room_finished", str(room_id))
        )

    kept_placement = Placement.objects.get()
    assert kept_placement.pk == relocated.pk
    assert kept_placement.cluster == "lyon"
    assert kept_placement.sid == ""
    assert kept_placement.epoch == 1
    assert kept_placement.updated_at == relocated.updated_at
    for cleanup in room_cleanup:
        cleanup.assert_not_called()
    assert (
        f"LiveKit room {room_id} finished on LiveKit cluster paris with SID {SID}, "
        "but is placed on LiveKit cluster lyon with SID '': ignoring the event"
    ) in caplog.text


def test_receive_room_finished_without_placement(two_livekit_clusters, room_cleanup):
    """A LiveKit room that finished without placement has its room cleaned up,
    as before placements existed."""
    _paris, lyon = two_livekit_clusters
    room_id = uuid.uuid4()
    Placement.objects.create(room_name="other-room", cluster="lyon", sid=SID)

    LiveKitEventsService().receive(
        room_event_request(lyon, "room_finished", str(room_id))
    )

    assert Placement.objects.filter(room_name="other-room").exists()
    for cleanup in room_cleanup:
        cleanup.assert_called_once_with(room_id)


def test_receive_room_finished_without_sid(two_livekit_clusters, room_cleanup):
    """A room event without SID leaves placements as they are, and the room is
    cleaned up as before placements existed."""
    _paris, lyon = two_livekit_clusters
    room_id = uuid.uuid4()
    Placement.objects.create(room_name=str(room_id), cluster="lyon", sid=SID)

    LiveKitEventsService().receive(
        room_event_request(lyon, "room_finished", str(room_id), sid="")
    )

    assert Placement.objects.filter(room_name=str(room_id)).exists()
    for cleanup in room_cleanup:
        cleanup.assert_called_once_with(room_id)


@mock.patch("core.services.presence.cache.delete")
def test_participant_left_clearing_gated_by_setting(mock_delete, service, settings):
    """PRESENCE_CLEAR_ON_PARTICIPANT_LEFT toggles eager presence invalidation."""
    data = mock.Mock()
    data.room.name = "room-name"
    data.participant.identity = "user-sub"

    settings.PRESENCE_CLEAR_ON_PARTICIPANT_LEFT = False
    service._handle_participant_left(data)  # pylint: disable=protected-access
    mock_delete.assert_not_called()

    settings.PRESENCE_CLEAR_ON_PARTICIPANT_LEFT = True
    service._handle_participant_left(data)  # pylint: disable=protected-access
    mock_delete.assert_called_once()


@mock.patch("core.services.presence.cache.delete")
def test_participant_left_without_identity_is_ignored(mock_delete, service, settings):
    """No cache operation when the webhook carries no identity."""
    settings.PRESENCE_CLEAR_ON_PARTICIPANT_LEFT = True
    data = mock.Mock()
    data.room.name = "room-name"
    data.participant.identity = ""

    service._handle_participant_left(data)  # pylint: disable=protected-access
    mock_delete.assert_not_called()


@pytest.mark.parametrize(
    ("egress_status", "worker_event", "outcome"),
    (
        (EgressStatus.EGRESS_COMPLETE, "completed", "success"),
        (EgressStatus.EGRESS_LIMIT_REACHED, "limit reached", "success"),
        (EgressStatus.EGRESS_ABORTED, "aborted", "failure"),
        (EgressStatus.EGRESS_FAILED, "failed", "failure"),
    ),
)
@mock.patch(
    "core.recording.services.recording_events.notification_service."
    "notify_external_services"
)
@mock.patch("core.utils.notify_participants")
@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_is_audited(  # noqa: PLR0913, PLR0917
    mock_update_metadata,
    mock_notify,
    mock_notify_external_services,
    egress_status,
    worker_event,
    outcome,
    service,
    audit_events,
):  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """The end of a recording is audited as LiveKit reports it."""

    recording = RecordingFactory(
        worker_id="worker-1",
        status="active",
        mode="screen_recording",
        options={"transcribe": True},
    )
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = egress_status
    mock_data.egress_info.error_code = 0

    service._handle_egress_ended(mock_data)

    [event] = find_events(audit_events, "recording.end")

    assert event["event"]["type"] == ["end"]
    assert event["lasuite"]["outcome"] == outcome
    assert event["lasuite"]["actor"] == {"type": "service"}
    assert event["service"]["origin"] == {"name": "livekit"}
    assert event["lasuite"]["auth"] == {"method": "shared_secret"}
    assert event["entity"]["target"]["id"] == str(recording.id)
    assert event["entity"]["target"]["raw"]["is_transcribed"] is True
    assert event["lasuite"]["details"] == {"worker_event": worker_event}


@mock.patch("core.services.room_management.RoomManagement.update_metadata")
def test_handle_egress_ended_with_an_unmapped_status_is_audited_as_unknown(
    mock_update_metadata, service, audit_events
):
    """An egress status the backend does not map has an unknown outcome."""
    recording = RecordingFactory(worker_id="worker-1", status="active")
    mock_data = mock.MagicMock()
    mock_data.egress_info.egress_id = recording.worker_id
    mock_data.egress_info.status = 999
    mock_data.egress_info.error_code = 0

    service._handle_egress_ended(mock_data)

    [event] = find_events(audit_events, "recording.end")

    assert event["event"]["outcome"] == "unknown"
    assert event["lasuite"]["outcome"] == "unknown"
    assert event["log"]["level"] == "warning"
    assert "details" not in event["lasuite"]
