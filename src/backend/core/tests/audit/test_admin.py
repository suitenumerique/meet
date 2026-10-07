"""Tests for the audit of writes made through the Django admin."""

import json
from unittest import mock

from django.test import override_settings

import pytest

from core import models
from core.audit.testing import find_events
from core.factories import (
    FileFactory,
    RecordingFactory,
    RoomFactory,
    UserFactory,
    UserResourceAccessFactory,
)

pytestmark = pytest.mark.django_db

# Admin pages render static files: serve them without a manifest.
plain_storages = override_settings(
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        },
    }
)


@pytest.fixture(name="staff_client")
def staff_client_fixture(client):
    """A client signed in as a superuser, able to reach every admin page."""
    client.force_login(UserFactory(is_staff=True, is_superuser=True))
    return client


def room_payload(room=None, accesses=0, **overrides):
    """Return what the room change form expects, inline management included."""
    payload = {
        "name": room.name if room else "Weekly sync",
        "slug": room.slug if room else "weekly-sync",
        "access_level": room.access_level if room else models.RoomAccessLevel.PUBLIC,
        "configuration": "{}",
        # ``configuration`` has a callable default, so the form renders a hidden
        # ``initial-`` input. Without it the field always looks changed.
        "initial-configuration": "{}",
        "pin_code": (room.pin_code if room else None) or "",
        "accesses-TOTAL_FORMS": str(accesses),
        "accesses-INITIAL_FORMS": "0",
        "accesses-MIN_NUM_FORMS": "0",
        "accesses-MAX_NUM_FORMS": "1000",
    }
    payload.update(overrides)
    return payload


def test_room_creation_is_audited(audit_events, staff_client):
    """Adding a room through the admin records a creation on the room."""
    response = staff_client.post("/admin/core/room/add/", room_payload())

    assert response.status_code == 302

    [event] = find_events(audit_events, "admin.room.create")

    assert event["event"]["category"] == ["configuration"]
    assert event["event"]["type"] == ["creation"]
    assert event["event"]["outcome"] == "success"
    assert event["lasuite"]["target"]["type"] == "room"
    assert event["lasuite"]["target"]["slug"] == "weekly-sync"
    assert event["lasuite"]["details"]["changes"]["name"] == {"to": "Weekly sync"}


def test_room_change_records_field_names_and_allowed_values(audit_events, staff_client):
    """A change reports the raw field names, and the values of allowed fields."""
    room = RoomFactory(access_level=models.RoomAccessLevel.PUBLIC)

    response = staff_client.post(
        f"/admin/core/room/{room.pk}/change/",
        room_payload(room, access_level=models.RoomAccessLevel.RESTRICTED),
    )

    assert response.status_code == 302

    [event] = find_events(audit_events, "admin.room.update")

    assert event["event"]["type"] == ["change"]
    assert event["lasuite"]["details"]["changed_fields"] == ["access_level"]
    assert event["lasuite"]["details"]["changes"] == {
        "access_level": {"from": "public", "to": "restricted"}
    }


def test_room_configuration_change_records_both_versions(audit_events, staff_client):
    """The configuration is allow-listed, and kept as JSON rather than stringified."""
    room = RoomFactory(configuration={"a": 1})

    response = staff_client.post(
        f"/admin/core/room/{room.pk}/change/",
        room_payload(
            room,
            configuration='{"a": 2, "b": "new"}',
            **{"initial-configuration": '{"a": 1}'},
        ),
    )

    assert response.status_code == 302

    [event] = find_events(audit_events, "admin.room.update")

    assert event["lasuite"]["details"]["changed_fields"] == ["configuration"]
    assert event["lasuite"]["details"]["changes"]["configuration"] == {
        "from": {"a": 1},
        "to": {"a": 2, "b": "new"},
    }


def test_room_deletion_is_audited(audit_events, staff_client):
    """Deleting a room from its own page records a deletion."""
    room = RoomFactory()

    response = staff_client.post(f"/admin/core/room/{room.pk}/delete/", {"post": "yes"})

    assert response.status_code == 302

    [event] = find_events(audit_events, "admin.room.delete")

    assert event["event"]["type"] == ["deletion"]
    assert event["lasuite"]["target"]["id"] == str(room.pk)


def test_inline_access_grant_emits_its_own_iam_event(audit_events, staff_client):
    """A role granted through the inline is an IAM event of its own."""
    room = RoomFactory()
    user = UserFactory()

    response = staff_client.post(
        f"/admin/core/room/{room.pk}/change/",
        room_payload(
            room,
            accesses=1,
            **{
                "accesses-0-user": str(user.pk),
                "accesses-0-role": models.RoleChoices.OWNER,
                "accesses-0-id": "",
                "accesses-0-resource": str(room.pk),
            },
        ),
    )

    assert response.status_code == 302

    [room_event] = find_events(audit_events, "admin.room.update")
    [access_event] = find_events(audit_events, "admin.resourceaccess.create")

    assert access_event["event"]["category"] == ["iam"]
    assert access_event["event"]["type"] == ["creation"]
    assert access_event["lasuite"]["target"]["role"] == "owner"
    assert access_event["lasuite"]["details"]["changes"]["role"] == {"to": "owner"}
    # The grant and the room change belong to the same request.
    assert access_event["trace"]["id"] == room_event["trace"]["id"]


def test_user_change_targets_the_user_and_never_leaks_the_password(
    audit_events, staff_client
):
    """Promoting a user is an IAM event naming the account, never its secret."""
    user = UserFactory(email="promoted@example.com", is_staff=False)

    response = staff_client.post(
        f"/admin/core/user/{user.pk}/password/",
        {
            "usable_password": "true",
            "password1": "sup3r-s3cret-value",
            "password2": "sup3r-s3cret-value",
        },
    )

    assert response.status_code == 302

    [event] = find_events(audit_events, "admin.user.update")

    assert event["event"]["category"] == ["iam"]
    assert event["event"]["type"] == ["user", "change"]
    assert event["user"]["target"] == {
        "id": str(user.pk),
        "sub": user.sub,
        "domain": "example.com",
    }
    assert event["lasuite"]["details"]["changed_fields"] == ["password"]
    assert "changes" not in event["lasuite"]["details"]
    assert "sup3r-s3cret-value" not in json.dumps(event)


def test_user_permission_change_records_the_flag_values(audit_events, staff_client):
    """Staff and superuser flags are allow-listed, so their values are kept."""
    user = UserFactory(is_staff=False, is_superuser=False)

    response = staff_client.post(
        f"/admin/core/user/{user.pk}/change/",
        {
            "admin_email": "",
            "language": user.language,
            "timezone": str(user.timezone),
            "is_active": "on",
            "is_staff": "on",
            "files_created-TOTAL_FORMS": "0",
            "files_created-INITIAL_FORMS": "0",
            "files_created-MIN_NUM_FORMS": "0",
            "files_created-MAX_NUM_FORMS": "1000",
        },
    )

    assert response.status_code == 302

    [event] = find_events(audit_events, "admin.user.update")

    assert event["lasuite"]["details"]["changes"]["is_staff"] == {
        "from": False,
        "to": True,
    }
    assert event["user"]["target"]["id"] == str(user.pk)


def test_bulk_delete_audits_each_object_but_not_the_action(audit_events, staff_client):
    """``delete_selected`` reports its objects, and nothing about itself."""
    recordings = RecordingFactory.create_batch(2)

    response = staff_client.post(
        "/admin/core/recording/",
        {
            "action": "delete_selected",
            "_selected_action": [str(recording.pk) for recording in recordings],
            "post": "yes",
        },
    )

    assert response.status_code == 302

    events = find_events(audit_events, "admin.recording.delete")

    assert {event["lasuite"]["target"]["id"] for event in events} == {
        str(recording.pk) for recording in recordings
    }
    assert find_events(audit_events, "admin.recording.action") == []


def test_custom_action_is_audited(audit_events, staff_client):
    """A custom admin action reports its name and how many objects it ran on."""
    recordings = RecordingFactory.create_batch(2)

    response = staff_client.post(
        "/admin/core/recording/",
        {
            "action": "mark_as_failed_to_stop",
            "_selected_action": [str(recording.pk) for recording in recordings],
        },
    )

    assert response.status_code == 302

    [event] = find_events(audit_events, "admin.recording.action")

    assert event["event"]["outcome"] == "success"
    assert event["lasuite"]["details"] == {
        "admin_action": "mark_as_failed_to_stop",
        "count": 2,
    }


def test_hard_deleted_file_is_audited_once(audit_events, staff_client):
    """``FileAdmin`` hard deletes without going through ``Model.delete``."""
    file = FileFactory()

    response = staff_client.post(f"/admin/core/file/{file.pk}/delete/", {"post": "yes"})

    assert response.status_code == 302

    [event] = find_events(audit_events, "admin.file.delete")

    assert event["lasuite"]["target"]["id"] == str(file.pk)


def test_failed_deletion_is_audited_as_a_failure(audit_events, staff_client):
    """A deletion that raises is recorded as failed, never as done."""
    file = FileFactory()

    with (
        mock.patch("core.admin.hard_delete_file", side_effect=RuntimeError("S3 down")),
        pytest.raises(RuntimeError),
    ):
        staff_client.post(f"/admin/core/file/{file.pk}/delete/", {"post": "yes"})

    [event] = find_events(audit_events, "admin.file.delete")

    assert event["event"]["type"] == ["deletion"]
    assert event["event"]["reason"] == "internal_error"
    assert event["lasuite"]["outcome"] == "failure"
    assert event["lasuite"]["target"]["id"] == str(file.pk)
    assert event["error"] == {"message": "S3 down"}
    assert event["log"]["level"] == "error"


def test_failed_bulk_deletion_is_audited_as_a_failure(audit_events, staff_client):
    """A bulk deletion that raises reports every selected object as failed."""
    files = FileFactory.create_batch(2)

    with (
        mock.patch("core.admin.hard_delete_file", side_effect=RuntimeError("S3 down")),
        pytest.raises(RuntimeError),
    ):
        staff_client.post(
            "/admin/core/file/",
            {
                "action": "delete_selected",
                "_selected_action": [str(file.pk) for file in files],
                "post": "yes",
            },
        )

    events = find_events(audit_events, "admin.file.delete")

    assert {event["lasuite"]["target"]["id"] for event in events} == {
        str(file.pk) for file in files
    }
    assert {event["lasuite"]["outcome"] for event in events} == {"failure"}


@plain_storages
def test_reading_the_admin_emits_nothing(audit_events, staff_client):
    """Browsing is not audited: only writes are."""
    room = RoomFactory()
    UserResourceAccessFactory(resource=room, user=UserFactory())

    assert staff_client.get("/admin/").status_code == 200
    assert staff_client.get("/admin/core/room/").status_code == 200
    assert staff_client.get(f"/admin/core/room/{room.pk}/change/").status_code == 200
    assert staff_client.get(f"/admin/core/room/{room.pk}/history/").status_code == 200

    assert [
        event["event"]["action"]
        for event in audit_events
        if event["event"]["action"].startswith("admin.")
    ] == []


def test_non_staff_user_reaching_the_admin_is_recorded(audit_events, client):
    """A signed-in account without staff access trying the admin is a denial."""
    client.force_login(UserFactory(is_staff=False))

    response = client.get("/admin/core/room/")

    assert response.status_code == 302

    [event] = find_events(audit_events, "admin.access")

    assert event["event"]["category"] == ["iam"]
    assert event["event"]["reason"] == "permission_denied"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["auth"] == {"method": "session"}
    assert event["http"]["response"] == {"status_code": 302}
    assert event["log"]["level"] == "warning"


@plain_storages
def test_non_staff_user_is_recorded_once_per_refused_view(audit_events, client):
    """Landing on the login page after the refusal records nothing more."""
    client.force_login(UserFactory(is_staff=False))

    response = client.get("/admin/", follow=True)

    assert response.redirect_chain[-1][0].startswith("/admin/login/")
    assert response.status_code == 200
    assert len(find_events(audit_events, "admin.access")) == 1


def test_anonymous_visitor_is_not_recorded(audit_events, client):
    """An anonymous hit is a redirect to the login page, not a denial worth keeping."""
    assert client.get("/admin/").status_code == 302

    assert find_events(audit_events, "admin.access") == []
