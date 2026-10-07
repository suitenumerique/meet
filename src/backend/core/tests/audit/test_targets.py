"""Tests for the description of audit targets."""

from django.utils.functional import SimpleLazyObject

import pytest

from core.audit.registry import ModelOptions, model_options
from core.audit.targets import describe_target
from core.audit.testing import override_registration
from core.factories import RecordingFactory, RoomFactory, UserFactory
from core.models import Recording, Resource, Room

pytestmark = pytest.mark.django_db


def test_describe_target_reads_the_registered_fields():
    """A model is described by its name, its key and its registered fields."""
    room = RoomFactory()

    with override_registration(Room, fields=("slug", "access_level")):
        described = describe_target(room)

    assert described == {
        "type": "room",
        "id": str(room.pk),
        "slug": room.slug,
        "access_level": room.access_level,
    }


def test_describe_target_renders_values():
    """Foreign keys, enums and other values are rendered for JSON."""
    recording = RecordingFactory()

    with override_registration(Recording, fields=("room_id", "room")):
        described = describe_target(recording)

    assert described == {
        "type": "recording",
        "id": str(recording.pk),
        "room_id": str(recording.room_id),
        "room": str(recording.room_id),
    }


def test_describe_target_without_fields():
    """A model registered without fields stays identifiable."""
    room = RoomFactory()

    with override_registration(Room):
        described = describe_target(room)

    assert described == {"type": "room", "id": str(room.pk)}


def test_describe_target_identifies_users_without_their_email():
    """A user is identified by its key, OIDC sub and email domain."""
    user = UserFactory(email="jane@Example.org", sub="oidc-sub-1")

    assert describe_target(user) == {
        "type": "user",
        "id": str(user.pk),
        "sub": "oidc-sub-1",
        "domain": "example.org",
    }


def test_describe_target_of_a_user_without_sub():
    """A user who never signed in, such as a provisional one, has no sub.

    The empty value is pruned when the event is built.
    """
    user = UserFactory(email="jane@example.org", sub=None)

    assert describe_target(user) == {
        "type": "user",
        "id": str(user.pk),
        "sub": None,
        "domain": "example.org",
    }


def test_describe_target_sees_through_lazy_objects():
    """A lazy proxy is described as the object it wraps."""
    room = RoomFactory()

    with override_registration(Room, fields=("slug",)):
        described = describe_target(SimpleLazyObject(lambda: room))

    assert described == {
        "type": "room",
        "id": str(room.pk),
        "slug": room.slug,
    }


def test_describe_target_mapping_passes_through():
    """A ready-made dict is used verbatim."""
    assert describe_target({"type": "x", "id": "1"}) == {"type": "x", "id": "1"}


def test_describe_target_of_a_plain_object():
    """Anything else is identified by its class and string form."""

    class Thing:  # pylint: disable=missing-class-docstring
        def __str__(self):
            return "thing-1"

    assert describe_target(Thing()) == {"type": "thing", "id": "thing-1"}


def test_model_options_by_model():
    """Options are looked up by model, and default to nothing."""
    with override_registration(Room, fields=("slug",)):
        assert model_options(Room) == ModelOptions(fields=("slug",))
    assert model_options(Resource) == ModelOptions()
