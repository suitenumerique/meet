"""
Test rooms API endpoints in the Meet core app: start recording.
"""

# pylint: disable=redefined-outer-name,unused-argument

from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import Recording
from ...recording.worker.exceptions import RecordingStartError

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_worker_service():
    """Mock worker service."""
    return mock.Mock()


@pytest.fixture
def mock_worker_service_factory(mock_worker_service):
    """Mock worker service factory."""
    with mock.patch(
        "core.api.viewsets.get_worker_service",
        return_value=mock_worker_service,
    ) as mock_worker_service_factory:
        yield mock_worker_service_factory


@pytest.fixture
def mock_worker_manager(mock_worker_service):
    """Mock worker service mediator."""
    with mock.patch("core.api.viewsets.WorkerServiceMediator") as mock_mediator_class:
        mock_mediator = mock.Mock()
        mock_mediator_class.return_value = mock_mediator
        yield mock_mediator


def test_start_recording_anonymous():
    """Anonymous users should not be allowed to start room recordings."""
    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 401
    assert Recording.objects.count() == 0


def test_start_recording_non_owner_and_non_administrator(settings):
    """Non-owner and Non-Administrator users should not be allowed to start room recordings."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 403
    assert Recording.objects.count() == 0


def test_start_recording_recording_disabled(settings):
    """Should fail if recording is disabled for the room."""
    settings.RECORDING_ENABLE = False

    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found."}
    assert Recording.objects.count() == 0


def test_start_recording_missing_mode(settings):
    """Should fail if recording mode is not provided."""
    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.post(f"/api/v1.0/rooms/{room.id}/start-recording/", {})

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid request."}
    assert Recording.objects.count() == 0


def test_start_recording_worker_error(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Should handle worker service errors appropriately."""
    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    # Configure mock mediator to raise error
    mock_start = mock.Mock()
    mock_start.side_effect = RecordingStartError("Failed to connect to worker")

    mock_worker_manager.start = mock_start

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    mock_worker_service_factory.assert_called_once_with(mode="screen_recording")

    assert response.status_code == 500
    assert response.json() == {
        "error": f"Recording failed to start for room {room.slug}"
    }

    # Recording object should be created even if worker fails, and moved out
    # of the unique-constraint window so the room is not locked.
    assert Recording.objects.count() == 1
    recording = Recording.objects.first()
    assert recording.room == room
    assert recording.mode == "screen_recording"
    assert recording.status == "failed_to_start"

    # Verify recording access details
    assert recording.accesses.count() == 1
    access = recording.accesses.first()
    assert access.user == user
    assert access.role == "owner"


def test_start_recording_conflict_when_already_in_progress(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """A second start attempt while a recording is initiated/active returns 409."""
    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")

    # Pre-existing active recording for the same room.
    Recording.objects.create(room=room, mode="screen_recording", status="active")

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 409
    assert response.json() == {
        "error": f"A recording is already in progress for room {room.slug}"
    }
    # No new recording row, no access row leaked from the rolled-back transaction.
    assert Recording.objects.count() == 1
    assert Recording.objects.first().accesses.count() == 0
    mock_worker_manager.start.assert_not_called()


def test_start_recording_after_worker_failure_unblocks_room(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """After a failed start, the room can accept a new recording."""
    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")

    mock_worker_manager.start = mock.Mock(
        side_effect=[RecordingStartError("boom"), None]
    )

    client = APIClient()
    client.force_login(user)

    first = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )
    assert first.status_code == 500

    second = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )
    assert second.status_code == 201
    assert Recording.objects.count() == 2


def test_start_recording_success(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Should successfully start recording when everything is configured correctly."""
    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    # Make user the room owner
    room.accesses.create(user=user, role="owner")

    mock_start = mock.Mock()
    mock_worker_manager.start = mock_start

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    mock_worker_service_factory.assert_called_once_with(mode="screen_recording")

    assert response.status_code == 201
    assert response.json() == {
        "message": f"Recording successfully started for room {room.slug}"
    }

    # Verify the mediator was called with the recording
    recording = Recording.objects.first()
    mock_start.assert_called_once_with(recording)

    assert recording.room == room
    assert recording.mode == "screen_recording"

    # Verify recording access details
    assert recording.accesses.count() == 1
    access = recording.accesses.first()
    assert access.user == user
    assert access.role == "owner"


@pytest.mark.parametrize("value", ["fr", "en", "nl", "de"])
def test_start_recording_options_language_valid(
    settings, mock_worker_service_factory, mock_worker_manager, value
):
    """Should accept a valid ISO 639-1 language code."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"language": value}},
        format="json",
    )

    assert response.status_code == 201

    recording = Recording.objects.get(room=room)
    assert recording.options == {"language": value}


@pytest.mark.parametrize("value", ["invalid-value", "francais", "123"])
def test_start_recording_options_language_not_validated(
    settings, mock_worker_service_factory, mock_worker_manager, value
):
    """Invalid language codes are currently accepted — no format validation yet.

    TODO: tighten this once language validation is introduced.
    """
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"language": value}},
        format="json",
    )

    assert response.status_code == 201


def test_start_recording_options_language_null(
    settings, mock_worker_service_factory, mock_worker_manager
):
    """Should accept null language (triggers auto-detection)."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"language": None}},
        format="json",
    )

    assert response.status_code == 201
    recording = Recording.objects.get(room=room)
    assert recording.options == {}


@pytest.mark.parametrize("value", [True, 1, "y", "on", "true", "yes", "t"])
def test_start_recording_options_transcribe_valid_true(
    settings, mock_worker_service_factory, mock_worker_manager, value
):
    """Should accept transcribe with any valid pydantic true values."""
    settings.RECORDING_ENABLE = True
    settings.METADATA_COLLECTOR_ENABLED = False
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"transcribe": value}},
        format="json",
    )

    assert response.status_code == 201
    recording = Recording.objects.get(room=room)
    assert recording.options == {"transcribe": True}


@pytest.mark.parametrize("value", [False, 0, "n", "off", "false", "no", "f"])
def test_start_recording_options_transcribe_valid_false(
    settings, mock_worker_service_factory, mock_worker_manager, value
):
    """Should accept transcribe with any valid pydantic false values."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"transcribe": value}},
        format="json",
    )

    assert response.status_code == 201
    recording = Recording.objects.get(room=room)
    assert recording.options == {"transcribe": False}


def test_start_recording_options_transcribe_null(
    settings, mock_worker_service_factory, mock_worker_manager
):
    """Should accept transcribe=null (falls back to application default)."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"transcribe": None}},
        format="json",
    )

    assert response.status_code == 201
    recording = Recording.objects.get(room=room)
    assert recording.options == {}


def test_start_recording_options_null(
    settings, mock_worker_service_factory, mock_worker_manager
):
    """Should accept options=null."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": None},
        format="json",
    )

    assert response.status_code == 201
    recording = Recording.objects.get(room=room)
    assert recording.options == {}


def test_start_recording_options_omitted(
    settings, mock_worker_service_factory, mock_worker_manager
):
    """Should accept a request with no options field at all."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
        format="json",
    )

    assert response.status_code == 201
    recording = Recording.objects.get(room=room)
    assert recording.options == {}


def test_start_recording_options_unknown_field_rejected(settings):
    """Should reject unknown fields in options (extra='forbid')."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"unknown_field": "value"}},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.parametrize("value", ["foo", 12])
def test_start_recording_options_invalid_transcribe_type(settings, value):
    """Should reject non-boolean transcribe values."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"transcribe": value}},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.parametrize("value", ["screen_recording", "transcript"])
def test_start_recording_options_original_mode_valid(
    settings, mock_worker_service_factory, mock_worker_manager, value
):
    """Should accept valid recording mode choices for original_mode."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"original_mode": value}},
        format="json",
    )

    assert response.status_code == 201
    recording = Recording.objects.get(room=room)
    assert recording.options == {"original_mode": value}


def test_start_recording_options_original_mode_null(
    settings, mock_worker_service_factory, mock_worker_manager
):
    """Should accept original_mode=null."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"original_mode": None}},
        format="json",
    )

    assert response.status_code == 201
    recording = Recording.objects.get(room=room)
    assert recording.options == {}


def test_start_recording_options_original_mode_omitted(
    settings, mock_worker_service_factory, mock_worker_manager
):
    """Should accept a request with original_mode omitted."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {}},
        format="json",
    )

    assert response.status_code == 201
    recording = Recording.objects.get(room=room)
    assert recording.options == {}


def test_start_recording_calls_metadata_collector_start(
    settings, mock_worker_service_factory, mock_worker_manager
):
    """Should call MetadataCollectorService.start when conditions are met."""
    settings.RECORDING_ENABLE = True
    settings.METADATA_COLLECTOR_ENABLED = True

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    with mock.patch(
        "core.api.viewsets.MetadataCollectorService"
    ) as mock_collector_class:
        mock_collector = mock.Mock()
        mock_collector_class.return_value = mock_collector

        response = client.post(
            f"/api/v1.0/rooms/{room.id}/start-recording/",
            {
                "mode": "screen_recording",
                "options": {"transcribe": True, "collect_metadata": True},
            },
            format="json",
        )

    assert response.status_code == 201

    recording = Recording.objects.get(room=room)
    mock_collector.start.assert_called_once_with(recording)


@pytest.mark.parametrize(
    "metadata_enabled,options",
    [
        # Metadata collector disabled, regardless of transcribe option
        (False, {"transcribe": True}),
        (False, {"transcribe": False}),
        (False, None),
        # Metadata collector enabled, but transcribe is False or missing
        (True, {"transcribe": False}),
        (True, None),
        # Metadata collector enabled, transcribe True, but collect_metadata explicitly False
        (True, {"transcribe": True, "collect_metadata": False}),
    ],
)
def test_start_recording_does_not_call_metadata_collector_start_when_conditions_not_met(
    settings,
    mock_worker_service_factory,
    mock_worker_manager,
    metadata_enabled,
    options,
):
    """Should not call MetadataCollectorService.start when conditions are not met."""
    settings.RECORDING_ENABLE = True
    settings.METADATA_COLLECTOR_ENABLED = metadata_enabled

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    payload = {"mode": "screen_recording"}
    if options is not None:
        payload["options"] = options

    with mock.patch(
        "core.api.viewsets.MetadataCollectorService"
    ) as mock_collector_class:
        mock_collector = mock.Mock()
        mock_collector_class.return_value = mock_collector

        response = client.post(
            f"/api/v1.0/rooms/{room.id}/start-recording/",
            payload,
            format="json",
        )

    assert response.status_code == 201
    mock_collector.start.assert_not_called()


@pytest.mark.parametrize("value", ["invalid_mode", "foo", 123, "SCREEN_RECORDING"])
def test_start_recording_options_original_mode_invalid(settings, value):
    """Should reject invalid recording mode values for original_mode."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording", "options": {"original_mode": value}},
        format="json",
    )

    assert response.status_code == 400
