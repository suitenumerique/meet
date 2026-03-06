"""
Test rooms API endpoints for recording permissions in the Meet core app.

Tests for the RECORDING_SCREEN_PERMISSION and RECORDING_TRANSCRIPT_PERMISSION settings.
"""

# pylint: disable=redefined-outer-name,unused-argument

from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import Recording, RecordingStatusChoices

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
    ) as mock_factory:
        yield mock_factory


@pytest.fixture
def mock_worker_manager(mock_worker_service):
    """Mock worker service mediator."""
    with mock.patch("core.api.viewsets.WorkerServiceMediator") as mock_mediator_class:
        mock_mediator = mock.Mock()
        mock_mediator_class.return_value = mock_mediator
        yield mock_mediator


# =============================================================================
# Tests for screen recording with admin_owner permission (default behavior)
# =============================================================================


def test_screen_recording_admin_owner_anonymous_denied(settings):
    """Anonymous users should not be allowed when permission is admin_owner."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 401
    assert Recording.objects.count() == 0


def test_screen_recording_admin_owner_authenticated_non_admin_denied(settings):
    """Authenticated non-admin users should be denied when permission is admin_owner."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"

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


def test_screen_recording_admin_owner_admin_allowed(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Admin users should be allowed when permission is admin_owner."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="administrator")

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 201
    assert Recording.objects.count() == 1


def test_screen_recording_admin_owner_owner_allowed(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Owner users should be allowed when permission is admin_owner."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 201
    assert Recording.objects.count() == 1


# =============================================================================
# Tests for screen recording with authenticated permission
# =============================================================================


def test_screen_recording_authenticated_anonymous_denied(settings):
    """Anonymous users should not be allowed when permission is authenticated."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "authenticated"

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 401
    assert Recording.objects.count() == 0


def test_screen_recording_authenticated_user_allowed(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Any authenticated user should be allowed when permission is authenticated."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "authenticated"

    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 201
    assert Recording.objects.count() == 1


def test_screen_recording_authenticated_admin_allowed(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Admin users should also be allowed when permission is authenticated."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "authenticated"

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="administrator")

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )

    assert response.status_code == 201
    assert Recording.objects.count() == 1


# =============================================================================
# Tests for transcript with admin_owner permission (default behavior)
# =============================================================================


def test_transcript_admin_owner_anonymous_denied(settings):
    """Anonymous users should not be allowed when transcript permission is admin_owner."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_TRANSCRIPT_PERMISSION = "admin_owner"

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "transcript"},
    )

    assert response.status_code == 401
    assert Recording.objects.count() == 0


def test_transcript_admin_owner_authenticated_non_admin_denied(settings):
    """Authenticated non-admin users should be denied when transcript permission is admin_owner."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_TRANSCRIPT_PERMISSION = "admin_owner"

    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "transcript"},
    )

    assert response.status_code == 403
    assert Recording.objects.count() == 0


def test_transcript_admin_owner_owner_allowed(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Owner users should be allowed when transcript permission is admin_owner."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_TRANSCRIPT_PERMISSION = "admin_owner"

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "transcript"},
    )

    assert response.status_code == 201
    assert Recording.objects.count() == 1


# =============================================================================
# Tests for transcript with authenticated permission
# =============================================================================


def test_transcript_authenticated_anonymous_denied(settings):
    """Anonymous users should not be allowed when transcript permission is authenticated."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_TRANSCRIPT_PERMISSION = "authenticated"

    room = RoomFactory()
    client = APIClient()

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "transcript"},
    )

    assert response.status_code == 401
    assert Recording.objects.count() == 0


def test_transcript_authenticated_user_allowed(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Any authenticated user should be allowed when transcript permission is authenticated."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_TRANSCRIPT_PERMISSION = "authenticated"

    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "transcript"},
    )

    assert response.status_code == 201
    assert Recording.objects.count() == 1


# =============================================================================
# Tests for mixed permissions (different levels for screen recording and transcript)
# =============================================================================


def test_mixed_permissions_screen_admin_transcript_authenticated(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Screen recording requires admin, transcript allows any authenticated user."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"
    settings.RECORDING_TRANSCRIPT_PERMISSION = "authenticated"

    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    # Screen recording should be denied for non-admin
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )
    assert response.status_code == 403

    # Transcript should be allowed for authenticated user
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "transcript"},
    )
    assert response.status_code == 201
    assert Recording.objects.count() == 1


def test_mixed_permissions_screen_authenticated_transcript_admin(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Screen recording allows any authenticated, transcript requires admin."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "authenticated"
    settings.RECORDING_TRANSCRIPT_PERMISSION = "admin_owner"

    room = RoomFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    # Screen recording should be allowed for authenticated user
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )
    assert response.status_code == 201

    # Stop the recording first
    recording = Recording.objects.first()
    recording.status = RecordingStatusChoices.SAVED
    recording.save()

    # Transcript should be denied for non-admin
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "transcript"},
    )
    assert response.status_code == 403


# =============================================================================
# Tests for stop recording permissions
# =============================================================================


def test_stop_recording_follows_mode_permission_admin_owner(settings):
    """Stop recording should follow the same permission as the recording mode."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"

    room = RoomFactory()
    user = UserFactory()
    owner = UserFactory()
    room.accesses.create(user=owner, role="owner")

    # Create an active recording
    Recording.objects.create(
        room=room, mode="screen_recording", status=RecordingStatusChoices.ACTIVE
    )

    client = APIClient()
    client.force_login(user)

    # Non-admin should not be able to stop
    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")
    assert response.status_code == 403


def test_stop_recording_follows_mode_permission_authenticated(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Stop recording should allow any authenticated user when permission is authenticated."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "authenticated"

    room = RoomFactory()
    user = UserFactory()

    # Create an active recording
    Recording.objects.create(
        room=room, mode="screen_recording", status=RecordingStatusChoices.ACTIVE
    )

    client = APIClient()
    client.force_login(user)

    # Any authenticated user should be able to stop
    response = client.post(f"/api/v1.0/rooms/{room.id}/stop-recording/")
    assert response.status_code == 200


# =============================================================================
# Tests for per-room recording permission overrides via room.configuration
# =============================================================================


def test_room_config_overrides_global_screen_recording_permission(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Room configuration should override global screen recording permission."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"

    room = RoomFactory(configuration={"screen_recording_permission": "authenticated"})
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    # Global is admin_owner, but room overrides to authenticated
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )
    assert response.status_code == 201
    assert Recording.objects.count() == 1


def test_room_config_overrides_global_transcript_permission(
    mock_worker_service_factory, mock_worker_manager, settings
):
    """Room configuration should override global transcript permission."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_TRANSCRIPT_PERMISSION = "admin_owner"

    room = RoomFactory(configuration={"transcript_permission": "authenticated"})
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    # Global is admin_owner, but room overrides to authenticated
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "transcript"},
    )
    assert response.status_code == 201
    assert Recording.objects.count() == 1


def test_room_config_restricts_when_global_is_permissive(settings):
    """Room configuration can restrict permissions even when global is permissive."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "authenticated"

    room = RoomFactory(configuration={"screen_recording_permission": "admin_owner"})
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    # Global is authenticated, but room overrides to admin_owner
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )
    assert response.status_code == 403
    assert Recording.objects.count() == 0


def test_room_config_empty_falls_back_to_global(settings):
    """Without room configuration override, global permission applies."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"

    room = RoomFactory(configuration={})
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    # No room override, global admin_owner applies
    response = client.post(
        f"/api/v1.0/rooms/{room.id}/start-recording/",
        {"mode": "screen_recording"},
    )
    assert response.status_code == 403
    assert Recording.objects.count() == 0


def test_recording_permissions_in_room_response_for_admin(settings):
    """recording_permissions should be present in room response for admin users."""
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"
    settings.RECORDING_TRANSCRIPT_PERMISSION = "authenticated"

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="administrator")

    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/rooms/{room.id}/")
    assert response.status_code == 200
    assert "recording_permissions" in response.json()
    assert (
        response.json()["recording_permissions"]["screen_recording_permission"]
        == "admin_owner"
    )
    assert (
        response.json()["recording_permissions"]["transcript_permission"]
        == "authenticated"
    )


def test_recording_permissions_in_room_response_for_non_admin(settings):
    """recording_permissions should be present in room response for non-admin users."""
    settings.RECORDING_SCREEN_PERMISSION = "authenticated"
    settings.RECORDING_TRANSCRIPT_PERMISSION = "admin_owner"

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="member")

    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/rooms/{room.id}/")
    assert response.status_code == 200
    assert "recording_permissions" in response.json()
    assert (
        response.json()["recording_permissions"]["screen_recording_permission"]
        == "authenticated"
    )
    assert (
        response.json()["recording_permissions"]["transcript_permission"]
        == "admin_owner"
    )
    # configuration should NOT be visible to non-admin
    assert "configuration" not in response.json()


def test_recording_permissions_reflect_room_override(settings):
    """recording_permissions should reflect room configuration override."""
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"
    settings.RECORDING_TRANSCRIPT_PERMISSION = "admin_owner"

    room = RoomFactory(
        configuration={
            "screen_recording_permission": "authenticated",
            "transcript_permission": "authenticated",
        }
    )
    user = UserFactory()
    room.accesses.create(user=user, role="member")

    client = APIClient()
    client.force_login(user)

    response = client.get(f"/api/v1.0/rooms/{room.id}/")
    assert response.status_code == 200
    assert (
        response.json()["recording_permissions"]["screen_recording_permission"]
        == "authenticated"
    )
    assert (
        response.json()["recording_permissions"]["transcript_permission"]
        == "authenticated"
    )


def test_admin_can_patch_room_recording_config(settings):
    """Admin should be able to patch room configuration with recording permissions."""
    settings.RECORDING_ENABLE = True
    settings.RECORDING_SCREEN_PERMISSION = "admin_owner"

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="administrator")

    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id}/",
        {"configuration": {"screen_recording_permission": "authenticated"}},
        format="json",
    )
    assert response.status_code == 200
    assert (
        response.json()["recording_permissions"]["screen_recording_permission"]
        == "authenticated"
    )


def test_patch_room_rejects_invalid_recording_permission(settings):
    """Invalid recording permission values should be rejected with 400."""
    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="administrator")

    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id}/",
        {"configuration": {"screen_recording_permission": "everyone"}},
        format="json",
    )
    assert response.status_code == 400


def test_patch_room_rejects_invalid_transcript_permission(settings):
    """Invalid transcript permission values should be rejected with 400."""
    settings.RECORDING_ENABLE = True

    room = RoomFactory()
    user = UserFactory()
    room.accesses.create(user=user, role="administrator")

    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id}/",
        {"configuration": {"transcript_permission": "foobar"}},
        format="json",
    )
    assert response.status_code == 400
