"""Tests for the merge_duplicate_users management command."""

from unittest import mock

from django.core.management import base, call_command

import pytest

from core.factories import (
    FileFactory,
    UserFactory,
    UserRecordingAccessFactory,
    UserResourceAccessFactory,
)
from core.models import RecordingAccess, ResourceAccess, RoleChoices, User

pytestmark = pytest.mark.django_db

# pylint: disable=W0613


def test_merge_no_duplicates_does_nothing():
    """Command should do nothing when no duplicate users exist."""
    user = UserFactory(email="unique@example.com")
    call_command("merge_duplicate_users")
    assert User.objects.count() == 1
    assert User.objects.filter(id=user.id).exists()


def test_merge_keeps_most_recently_created_user():
    """Command should keep the most recently created user when duplicates exist."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    call_command("merge_duplicate_users")
    assert not User.objects.filter(id=user1.id).exists()
    assert User.objects.filter(id=user2.id).exists()


def test_merge_deletes_all_stale_users():
    """Command should delete all stale users and keep only the most recently created one."""
    email = "many@example.com"
    UserFactory(email=email)
    UserFactory(email=email)
    user_kept = UserFactory(email=email)
    call_command("merge_duplicate_users")
    assert User.objects.filter(email=email).count() == 1
    assert User.objects.filter(id=user_kept.id).exists()


# ── ResourceAccess ─────────────────────────────────────────────────────────────


def test_merge_transfers_resource_access_to_kept_user():
    """ResourceAccess should be transferred to the kept user when stale user is merged."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    ra = UserResourceAccessFactory(user=user1)
    call_command("merge_duplicate_users")
    ra.refresh_from_db()
    assert ra.user == user2


def test_merge_transfers_multiple_room_accesses():
    """All ResourceAccesses should be transferred to the kept user when stale user is merged."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    accesses = UserResourceAccessFactory.create_batch(3, user=user1)
    call_command("merge_duplicate_users")
    assert not ResourceAccess.objects.filter(user=user1).exists()
    for ra in accesses:
        assert ResourceAccess.objects.filter(user=user2, resource=ra.resource).exists()


def test_merge_all_resource_accesses_owned_by_kept_user_nothing_changes():
    """ResourceAccesses should remain unchanged when all are already owned by the kept user."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    accesses = UserResourceAccessFactory.create_batch(3, user=user2)
    call_command("merge_duplicate_users")
    assert not ResourceAccess.objects.filter(user=user1).exists()
    for ra in accesses:
        ra.refresh_from_db()
        assert ra.user == user2


def test_merge_resource_access_conflict_upgrades_to_owner():
    """ResourceAccess role should be upgraded to owner when stale user has a higher role."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    ra1 = UserResourceAccessFactory(user=user1, role=RoleChoices.OWNER)
    ra2 = UserResourceAccessFactory(
        user=user2, resource=ra1.resource, role=RoleChoices.MEMBER
    )
    other_accesses = UserResourceAccessFactory.create_batch(
        3, user=user1, role=RoleChoices.MEMBER
    )
    call_command("merge_duplicate_users")
    ra2.refresh_from_db()
    assert ra2.role == RoleChoices.OWNER
    assert not ResourceAccess.objects.filter(user=user1).exists()
    for ra in other_accesses:
        assert ResourceAccess.objects.filter(
            user=user2, resource=ra.resource, role=RoleChoices.MEMBER
        ).exists()


def test_merge_resource_access_conflict_upgrades_to_admin():
    """ResourceAccess role should be upgraded to admin when stale user has a higher role."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    ra1 = UserResourceAccessFactory(user=user1, role=RoleChoices.ADMIN)
    ra2 = UserResourceAccessFactory(
        user=user2, resource=ra1.resource, role=RoleChoices.MEMBER
    )
    other_accesses = UserResourceAccessFactory.create_batch(
        3, user=user1, role=RoleChoices.MEMBER
    )
    call_command("merge_duplicate_users")
    ra2.refresh_from_db()
    assert ra2.role == RoleChoices.ADMIN
    assert not ResourceAccess.objects.filter(user=user1).exists()
    for ra in other_accesses:
        assert ResourceAccess.objects.filter(
            user=user2, resource=ra.resource, role=RoleChoices.MEMBER
        ).exists()


def test_merge_resource_access_conflict_does_not_downgrade_role():
    """ResourceAccess role should not be downgraded when stale user has a lower role."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    ra1 = UserResourceAccessFactory(user=user1, role=RoleChoices.MEMBER)
    ra2 = UserResourceAccessFactory(
        user=user2, resource=ra1.resource, role=RoleChoices.OWNER
    )
    other_accesses = UserResourceAccessFactory.create_batch(
        3, user=user1, role=RoleChoices.MEMBER
    )
    call_command("merge_duplicate_users")
    ra2.refresh_from_db()
    assert ra2.role == RoleChoices.OWNER
    assert not ResourceAccess.objects.filter(user=user1).exists()
    for ra in other_accesses:
        assert ResourceAccess.objects.filter(
            user=user2, resource=ra.resource, role=RoleChoices.MEMBER
        ).exists()


def test_merge_resource_access_conflict_equal_role_keeps_single_access():
    """ResourceAccess should keep one entry for the kept user when both ones have the same role."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    ra1 = UserResourceAccessFactory(user=user1, role=RoleChoices.MEMBER)
    UserResourceAccessFactory(
        user=user2, resource=ra1.resource, role=RoleChoices.MEMBER
    )
    call_command("merge_duplicate_users")
    accesses = ResourceAccess.objects.filter(resource=ra1.resource)
    assert accesses.count() == 1
    assert accesses.first().user == user2
    assert accesses.first().role == RoleChoices.MEMBER


# ── RecordingAccess ────────────────────────────────────────────────────────────


def test_merge_transfers_recording_access_to_kept_user():
    """RecordingAccess should be transferred to the kept user when stale user is merged."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    rca = UserRecordingAccessFactory(user=user1)
    call_command("merge_duplicate_users")
    rca.refresh_from_db()
    assert rca.user == user2


def test_merge_transfers_multiple_recording_accesses():
    """All RecordingAccesses should be transferred to the kept user when stale user is merged."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    accesses = UserRecordingAccessFactory.create_batch(3, user=user1)
    call_command("merge_duplicate_users")
    assert not RecordingAccess.objects.filter(user=user1).exists()
    for rca in accesses:
        assert RecordingAccess.objects.filter(
            user=user2, recording=rca.recording
        ).exists()


def test_merge_all_recording_accesses_owned_by_kept_user_nothing_changes():
    """RecordingAccesses should remain unchanged when all are already owned by the kept user."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    accesses = UserRecordingAccessFactory.create_batch(3, user=user2)
    call_command("merge_duplicate_users")
    assert not RecordingAccess.objects.filter(user=user1).exists()
    for rca in accesses:
        rca.refresh_from_db()
        assert rca.user == user2


def test_merge_recording_access_conflict_upgrades_to_owner():
    """RecordingAccess role should be upgraded to owner when stale user has a higher role."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    rca1 = UserRecordingAccessFactory(user=user1, role=RoleChoices.OWNER)
    rca2 = UserRecordingAccessFactory(
        user=user2, recording=rca1.recording, role=RoleChoices.MEMBER
    )
    other_accesses = UserRecordingAccessFactory.create_batch(
        3, user=user1, role=RoleChoices.MEMBER
    )
    call_command("merge_duplicate_users")
    rca2.refresh_from_db()
    assert rca2.role == RoleChoices.OWNER
    assert not RecordingAccess.objects.filter(user=user1).exists()
    for rca in other_accesses:
        assert RecordingAccess.objects.filter(
            user=user2, recording=rca.recording, role=RoleChoices.MEMBER
        ).exists()


def test_merge_recording_access_conflict_upgrades_to_admin():
    """RecordingAccess role should be upgraded to admin when stale user has a higher role."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    rca1 = UserRecordingAccessFactory(user=user1, role=RoleChoices.ADMIN)
    rca2 = UserRecordingAccessFactory(
        user=user2, recording=rca1.recording, role=RoleChoices.MEMBER
    )
    other_accesses = UserRecordingAccessFactory.create_batch(
        3, user=user1, role=RoleChoices.MEMBER
    )
    call_command("merge_duplicate_users")
    rca2.refresh_from_db()
    assert rca2.role == RoleChoices.ADMIN
    assert not RecordingAccess.objects.filter(user=user1).exists()
    for rca in other_accesses:
        assert RecordingAccess.objects.filter(
            user=user2, recording=rca.recording, role=RoleChoices.MEMBER
        ).exists()


def test_merge_recording_access_conflict_does_not_downgrade_role():
    """RecordingAccess role should not be downgraded when stale user has a lower role."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    rca1 = UserRecordingAccessFactory(user=user1, role=RoleChoices.MEMBER)
    rca2 = UserRecordingAccessFactory(
        user=user2, recording=rca1.recording, role=RoleChoices.OWNER
    )
    other_accesses = UserRecordingAccessFactory.create_batch(
        3, user=user1, role=RoleChoices.MEMBER
    )
    call_command("merge_duplicate_users")
    rca2.refresh_from_db()
    assert rca2.role == RoleChoices.OWNER
    assert not RecordingAccess.objects.filter(user=user1).exists()
    for rca in other_accesses:
        assert RecordingAccess.objects.filter(
            user=user2, recording=rca.recording, role=RoleChoices.MEMBER
        ).exists()


def test_merge_recording_access_conflict_equal_role_keeps_single_access():
    """RecordingAccess should keep one entry for the user when both users have the same role."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    rca1 = UserRecordingAccessFactory(user=user1, role=RoleChoices.MEMBER)
    UserRecordingAccessFactory(
        user=user2, recording=rca1.recording, role=RoleChoices.MEMBER
    )
    call_command("merge_duplicate_users")
    accesses = RecordingAccess.objects.filter(recording=rca1.recording)
    assert accesses.count() == 1
    assert accesses.first().user == user2
    assert accesses.first().role == RoleChoices.MEMBER


# ── Files ──────────────────────────────────────────────────────────────────────


def test_merge_reassigns_files_to_kept_user():
    """Files should be reassigned to the kept user when stale user is merged."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    files = FileFactory.create_batch(3, creator=user1)
    call_command("merge_duplicate_users")
    for f in files:
        f.refresh_from_db()
        assert f.creator == user2


def test_merge_kept_user_own_files_untouched():
    """Files already owned by the kept user should remain unchanged after merge."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    FileFactory(creator=user1)
    kept_file = FileFactory(creator=user2)
    call_command("merge_duplicate_users")
    kept_file.refresh_from_db()
    assert kept_file.creator == user2


# ── Dry-run ────────────────────────────────────────────────────────────────────


def test_merge_dry_run_does_not_delete_users():
    """Command should not delete any users when dry-run is enabled."""
    UserFactory(email="dup@example.com")
    UserFactory(email="dup@example.com")
    call_command("merge_duplicate_users", dry_run=True)
    assert User.objects.filter(email="dup@example.com").count() == 2


def test_merge_dry_run_does_not_move_resource_access():
    """Command should not move resource accesses when dry-run is enabled."""
    user1 = UserFactory(email="dup@example.com")
    UserFactory(email="dup@example.com")
    ra = UserResourceAccessFactory(user=user1)
    call_command("merge_duplicate_users", dry_run=True)
    ra.refresh_from_db()
    assert ra.user == user1


def test_merge_dry_run_does_not_move_recording_access():
    """Command should not move recording accesses when dry-run is enabled."""
    user1 = UserFactory(email="dup@example.com")
    UserFactory(email="dup@example.com")
    ra = UserRecordingAccessFactory(user=user1)
    call_command("merge_duplicate_users", dry_run=True)
    ra.refresh_from_db()
    assert ra.user == user1


def test_merge_dry_run_does_not_move_files():
    """Command should not reassign files when dry-run is enabled."""
    user1 = UserFactory(email="dup@example.com")
    UserFactory(email="dup@example.com")
    f = FileFactory(creator=user1)
    call_command("merge_duplicate_users", dry_run=True)
    f.refresh_from_db()
    assert f.creator == user1


# ── Isolation ──────────────────────────────────────────────────────────────────


def test_merge_non_duplicate_users_untouched():
    """Non-duplicate users should remain untouched when other duplicates are merged."""
    unique = UserFactory(email="unique@example.com")
    UserFactory(email="dup@example.com")
    UserFactory(email="dup@example.com")
    call_command("merge_duplicate_users")
    assert User.objects.filter(id=unique.id).exists()


def test_merge_non_duplicate_resource_access_untouched():
    """ResourceAccess of non-duplicate users should remain untouched."""
    unique = UserFactory(email="unique@example.com")
    ra = UserResourceAccessFactory(user=unique)
    UserFactory(email="dup@example.com")
    UserFactory(email="dup@example.com")
    call_command("merge_duplicate_users")
    ra.refresh_from_db()
    assert ra.user == unique


def test_merge_multiple_email_groups_all_merged():
    """Command should merge all duplicate email groups in a single run."""
    for i in range(3):
        UserFactory(email=f"group{i}@example.com")
        UserFactory(email=f"group{i}@example.com")
    call_command("merge_duplicate_users")
    for i in range(3):
        assert User.objects.filter(email=f"group{i}@example.com").count() == 1
    assert User.objects.count() == 3


# ── NULL / blank email guard ───────────────────────────────────────────────────


def test_merge_does_not_merge_users_with_null_email():
    """Users with NULL email must never be merged together, even if multiple exist."""
    user1 = UserFactory(email=None)
    user2 = UserFactory(email=None)
    call_command("merge_duplicate_users")
    assert User.objects.filter(id=user1.id).exists()
    assert User.objects.filter(id=user2.id).exists()


def test_merge_does_not_merge_users_with_blank_email():
    """Users with empty-string email must never be merged together, even if multiple exist."""
    user1 = UserFactory(email="")
    user2 = UserFactory(email="")
    call_command("merge_duplicate_users")
    assert User.objects.filter(id=user1.id).exists()
    assert User.objects.filter(id=user2.id).exists()


# ── Atomicity ──────────────────────────────────────────────────────────────────


@mock.patch(
    "core.management.commands.merge_duplicate_users.Command._merge_recording_accesses",
    side_effect=Exception("forced failure"),
)
def test_merge_is_atomic_rolls_back_all_on_any_failure(mock_reassign_files):
    """Merge should be fully rolled back when any step fails."""
    user1 = UserFactory(email="dup@example.com")
    user2 = UserFactory(email="dup@example.com")
    resource_accesses = UserResourceAccessFactory.create_batch(3, user=user1)
    recording_accesses = UserRecordingAccessFactory.create_batch(3, user=user1)
    files = FileFactory.create_batch(3, creator=user1)

    with pytest.raises(base.CommandError):
        call_command("merge_duplicate_users")

    assert User.objects.filter(id=user1.id).exists()
    assert User.objects.filter(id=user2.id).exists()
    for ra in resource_accesses:
        ra.refresh_from_db()
        assert ra.user == user1
    for rca in recording_accesses:
        rca.refresh_from_db()
        assert rca.user == user1
    for f in files:
        f.refresh_from_db()
        assert f.creator == user1
