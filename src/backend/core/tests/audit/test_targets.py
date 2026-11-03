"""Tests for the description of audit targets."""

from django.utils.functional import SimpleLazyObject

import pytest

from core.audit.registry import ModelOptions, model_options
from core.audit.targets import describe_target, user_target_of
from core.audit.testing import override_registration
from core.factories import (
    ApplicationFactory,
    RecordingFactory,
    RoomFactory,
    UserFactory,
    UserRecordingAccessFactory,
)
from core.models import Application, Recording, Resource, ResourceAccess, Room

pytestmark = pytest.mark.django_db


def test_describe_target_reads_the_registered_fields():
    """A model is an ECS entity: its key, its model name and its registered fields."""
    room = RoomFactory()

    with override_registration(Room, fields=("slug", "access_level")):
        described = describe_target(room)

    assert described == {
        "id": str(room.pk),
        "sub_type": "room",
        "raw": {"slug": room.slug, "access_level": room.access_level},
    }


def test_describe_target_promotes_its_name():
    """A registered ``name`` is the ECS ``entity.name``, not a raw field."""
    room = RoomFactory(name="Daily standup")

    with override_registration(Room, fields=("name", "slug")):
        described = describe_target(room)

    assert described == {
        "id": str(room.pk),
        "sub_type": "room",
        "name": "Daily standup",
        "raw": {"slug": room.slug},
    }


def test_describe_target_reports_the_registered_entity_type():
    """A model registered with an ECS entity type is of that type."""
    application = ApplicationFactory()

    with override_registration(Application, entity_type="application"):
        described = describe_target(application)

    assert described == {
        "id": str(application.pk),
        "type": ["application"],
        "sub_type": "application",
    }


def test_describe_target_renders_values():
    """Foreign keys, enums and other values are rendered for JSON."""
    recording = RecordingFactory()

    with override_registration(Recording, fields=("room_id", "room")):
        described = describe_target(recording)

    assert described == {
        "id": str(recording.pk),
        "sub_type": "recording",
        "raw": {"room_id": str(recording.room_id), "room": str(recording.room_id)},
    }


def test_describe_target_without_fields():
    """A model registered without fields stays identifiable."""
    room = RoomFactory()

    with override_registration(Room):
        described = describe_target(room)

    assert described == {"id": str(room.pk), "sub_type": "room"}


def test_describe_target_identifies_users_without_their_email():
    """A user is an ECS user entity, identified by its key and OIDC sub."""
    user = UserFactory(email="jane@Example.org", sub="oidc-sub-1")

    described = describe_target(user)

    assert described == {
        "id": str(user.pk),
        "type": ["user"],
        "sub_type": "user",
        "raw": {"sub": "oidc-sub-1"},
    }
    assert "example.org" not in str(described).lower()


def test_describe_target_of_a_user_without_sub():
    """A user who never signed in, such as a provisional one, has no sub."""
    user = UserFactory(email="jane@example.org", sub=None)

    assert describe_target(user) == {
        "id": str(user.pk),
        "type": ["user"],
        "sub_type": "user",
    }


def test_describe_target_sees_through_lazy_objects():
    """A lazy proxy is described as the object it wraps."""
    room = RoomFactory()

    with override_registration(Room, fields=("slug",)):
        described = describe_target(SimpleLazyObject(lambda: room))

    assert described == {
        "id": str(room.pk),
        "sub_type": "room",
        "raw": {"slug": room.slug},
    }


def test_describe_target_mapping_passes_through():
    """A ready-made dict is used verbatim."""
    assert describe_target({"sub_type": "x", "id": "1"}) == {
        "sub_type": "x",
        "id": "1",
    }


def test_describe_target_of_a_plain_object():
    """Anything else is identified by its class and string form."""

    class Thing:  # pylint: disable=missing-class-docstring
        def __str__(self):
            return "thing-1"

    assert describe_target(Thing()) == {"id": "thing-1", "sub_type": "thing"}


def test_model_options_by_model():
    """Options are looked up by model, and default to nothing."""
    with override_registration(Room, fields=("slug",)):
        assert model_options(Room) == ModelOptions(fields=("slug",))
    assert model_options(Resource) == ModelOptions()


def test_user_target_of_a_user_is_itself():
    """An event on an account is about that account."""
    user = UserFactory()

    assert user_target_of(user) == user


def test_user_target_of_reads_the_registered_attribute():
    """An event on an access is about the user it grants a role to."""
    user = UserFactory()
    access = RoomFactory(users=[(user, "member")]).accesses.get()

    assert user_target_of(access) == user


def test_user_target_of_a_recording_access():
    """``core.auditing`` registers the user of a recording access."""
    access = UserRecordingAccessFactory()

    assert user_target_of(access) == access.user


def test_user_target_of_an_unregistered_model_is_none():
    """A model registered without a user target is about no account."""
    assert user_target_of(RoomFactory()) is None
    assert user_target_of("something") is None


def test_user_target_of_a_broken_registration_is_none(caplog):
    """An attribute that cannot be read costs the user target, not the event."""
    access = RoomFactory(users=[(UserFactory(), "member")]).accesses.get()

    with override_registration(ResourceAccess, user_target="no_such_attribute"):
        assert user_target_of(access) is None

    assert "no_such_attribute" in caplog.text


def test_user_target_of_an_attribute_that_is_not_a_user_is_none():
    """A registered attribute holding anything but an account is ignored."""
    access = RoomFactory(users=[(UserFactory(), "member")]).accesses.get()

    with override_registration(ResourceAccess, user_target="role"):
        assert user_target_of(access) is None
