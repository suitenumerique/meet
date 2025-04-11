"""
Unit tests for the Recording model
"""

from django.core.exceptions import ValidationError

import pytest

from core.factories import (
    RecordingFactory,
    RoomFactory,
    UserFactory,
    UserRecordingAccessFactory,
)
from core.models import Recording, RecordingModeChoices, RecordingStatusChoices
from core.recording.enums import FileExtension

pytestmark = pytest.mark.django_db


def test_models_recording_str():
    """The str representation should be the recording ID."""
    recording = RecordingFactory()
    assert str(recording) == f"Recording {recording.id} (initiated)"


def test_models_recording_ordering():
    """Recordings should be returned ordered by created_at in descending order."""
    RecordingFactory.create_batch(3)
    recordings = Recording.objects.all()
    assert recordings[0].created_at >= recordings[1].created_at
    assert recordings[1].created_at >= recordings[2].created_at


def test_models_recording_room_relationship():
    """It should maintain proper relationship with room."""
    room = RoomFactory()
    recording = RecordingFactory(room=room)
    assert recording.room == room
    assert recording in room.recordings.all()


def test_models_recording_default_status():
    """A new recording should have INITIATED status by default."""
    recording = RecordingFactory()
    assert recording.status == RecordingStatusChoices.INITIATED


def test_models_recording_unique_initiated_or_active_per_room():
    """Only one initiated or active recording should be allowed per room."""
    room = RoomFactory()
    RecordingFactory(room=room, status=RecordingStatusChoices.ACTIVE)

    with pytest.raises(ValidationError):
        RecordingFactory(room=room, status=RecordingStatusChoices.ACTIVE)

    with pytest.raises(ValidationError):
        RecordingFactory(room=room, status=RecordingStatusChoices.INITIATED)


def test_models_recording_multiple_finished_allowed():
    """Multiple finished recordings should be allowed in the same room."""
    room = RoomFactory()
    RecordingFactory(room=room, status=RecordingStatusChoices.SAVED)
    RecordingFactory(room=room, status=RecordingStatusChoices.SAVED)
    assert room.recordings.count() == 2


# Test get_abilities method


@pytest.mark.parametrize(
    "role",
    ["owner", "administrator"],
)
def test_models_recording_get_abilities_privileges_active(role):
    """Test abilities for active recording and privileged user."""

    user = UserFactory()
    access = UserRecordingAccessFactory(role=role, user=user)
    access.recording.status = RecordingStatusChoices.ACTIVE
    abilities = access.recording.get_abilities(user)

    assert abilities == {
        "destroy": False,  # Not final status
        "partial_update": False,
        "retrieve": True,  # Privileged users can always retrieve
        "stop": True,  # Not final status, so can stop
        "update": False,
    }


def test_models_recording_get_abilities_member_active():
    """Test abilities for a user who is unprivileged."""

    user = UserFactory()
    access = UserRecordingAccessFactory(role="member", user=user)
    access.recording.status = RecordingStatusChoices.ACTIVE
    abilities = access.recording.get_abilities(user)

    assert abilities == {
        "destroy": False,
        "partial_update": False,
        "retrieve": False,
        "stop": False,
        "update": False,
    }


@pytest.mark.parametrize(
    "role",
    ["owner", "administrator"],
)
def test_models_recording_get_abilities_privileges_final(role):
    """Test abilities for active recording and privileged user."""

    user = UserFactory()
    access = UserRecordingAccessFactory(role=role, user=user)
    access.recording.status = RecordingStatusChoices.SAVED
    abilities = access.recording.get_abilities(user)

    assert abilities == {
        "destroy": True,
        "partial_update": False,
        "retrieve": True,  # Privileged users can always retrieve
        "stop": False,  # In final status, so can not stop
        "update": False,
    }


def test_models_recording_get_abilities_member_final():
    """Test abilities for a user who is unprivileged."""

    user = UserFactory()
    access = UserRecordingAccessFactory(role="member", user=user)
    access.recording.status = RecordingStatusChoices.SAVED
    abilities = access.recording.get_abilities(user)

    assert abilities == {
        "destroy": False,
        "partial_update": False,
        "retrieve": False,
        "stop": False,
        "update": False,
    }


# Test is_savable method


def test_models_recording_is_savable_normal():
    """Test is_savable for normal recording status."""
    recording = RecordingFactory(status=RecordingStatusChoices.ACTIVE)
    assert recording.is_savable() is True


@pytest.mark.parametrize(
    "status",
    [
        RecordingStatusChoices.FAILED_TO_STOP,
        RecordingStatusChoices.FAILED_TO_START,
        RecordingStatusChoices.ABORTED,
    ],
)
def test_models_recording_is_savable_error(status):
    """Test is_savable for error status."""
    recording = RecordingFactory(status=status)
    assert recording.is_savable() is False


def test_models_recording_is_savable_already_saved():
    """Test is_savable for already saved recording."""
    recording = RecordingFactory(status=RecordingStatusChoices.SAVED)
    assert recording.is_savable() is False


def test_models_recording_is_savable_only_initiated():
    """Test is_savable for only initiated recording."""
    recording = RecordingFactory(status=RecordingStatusChoices.INITIATED)
    assert recording.is_savable() is False


# Test few corner cases


def test_models_recording_worker_id_optional():
    """Worker ID should be optional."""
    recording = RecordingFactory(worker_id=None)
    assert recording.worker_id is None

    recording = RecordingFactory(worker_id="worker-123")
    assert recording.worker_id == "worker-123"


def test_models_recording_invalid_status():
    """Test that setting an invalid status raises an error."""
    recording = RecordingFactory()
    recording.status = "INVALID_STATUS"
    with pytest.raises(ValidationError):
        recording.save()


def test_models_recording_room_deletion():
    """Test that deleting a room cascades to its recordings."""
    room = RoomFactory()
    recording = RecordingFactory(room=room)
    room.delete()
    assert not Recording.objects.filter(id=recording.id).exists()


def test_models_recording_worker_id_very_long():
    """Test worker_id with maximum length."""
    long_id = "w" * 255
    recording = RecordingFactory(worker_id=long_id)
    assert recording.worker_id == long_id

    too_long_id = "w" * 256
    with pytest.raises(ValidationError):
        RecordingFactory(worker_id=too_long_id)


# Test key property method


def test_models_recording_key_for_transcript(settings):
    """Test key property returns correct path for transcript mode."""

    settings.RECORDING_OUTPUT_FOLDER = "/custom/path"

    recording = RecordingFactory(mode=RecordingModeChoices.TRANSCRIPT)
    expected_path = f"/custom/path/{recording.id}.{FileExtension.OGG.value}"
    assert recording.key == expected_path


def test_models_recording_key_for_screen_recording(settings):
    """Test key property returns correct path for screen recording mode."""
    settings.RECORDING_OUTPUT_FOLDER = "/custom/path"

    recording = RecordingFactory(mode=RecordingModeChoices.SCREEN_RECORDING)
    expected_path = f"/custom/path/{recording.id}.{FileExtension.MP4.value}"
    assert recording.key == expected_path


def test_models_recording_key_for_unknown_mode(settings):
    """Test key property uses default extension for unknown mode."""

    settings.RECORDING_OUTPUT_FOLDER = "/custom/path"
    recording = RecordingFactory()
    # Directly set an invalid mode (bypassing validation)
    recording.mode = "unknown_mode"
    expected_path = f"/custom/path/{recording.id}.{FileExtension.MP4.value}"
    assert recording.key == expected_path
