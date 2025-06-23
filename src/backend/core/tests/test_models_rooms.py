"""
Unit tests for the Room model
"""

# pylint: disable=W0613

import secrets
from logging import Logger
from unittest import mock

from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import ValidationError

import pytest

from core.factories import RoomFactory, UserFactory
from core.models import Room, RoomAccessLevel

pytestmark = pytest.mark.django_db


def test_models_rooms_str():
    """The str representation should be the name."""
    room = RoomFactory()
    assert str(room) == room.name


def test_models_rooms_ordering():
    """Rooms should be returned ordered by name."""
    RoomFactory.create_batch(3)
    rooms = Room.objects.all()
    # Remove hyphens because postgresql is ignoring them when they sort
    assert rooms[1].name.replace("-", "") >= rooms[0].name.replace("-", "")
    assert rooms[2].name.replace("-", "") >= rooms[1].name.replace("-", "")


def test_models_rooms_name_maxlength():
    """The name field should be less than 100 characters."""
    RoomFactory(name="a" * 100)

    with pytest.raises(ValidationError) as excinfo:
        RoomFactory(name="a" * 101)

    assert "Ensure this value has at most 100 characters (it has 101)." in str(
        excinfo.value
    )


def test_models_rooms_slug_unique():
    """Room slugs should be unique."""
    RoomFactory(name="a room!")

    with pytest.raises(ValidationError) as excinfo:
        RoomFactory(name="A Room!")

    assert "Room with this Slug already exists." in str(excinfo.value)


def test_models_rooms_name_slug_like_uuid():
    """
    It should raise an error if the value of the name field leads to a slug looking
    like a UUID . We need unicity on the union of the `id` and `slug` fields.
    """
    with pytest.raises(ValidationError) as excinfo:
        RoomFactory(name="918689fb-038e 4e81-bf09 efd5902c5f0b")

    assert 'Room name "918689fb-038e 4e81-bf09 efd5902c5f0b" is reserved.' in str(
        excinfo.value
    )


def test_models_rooms_slug_automatic():
    """Room slugs should be automatically populated upon saving."""
    room = Room(name="Eléphant in the room")
    room.save()
    assert room.slug == "elephant-in-the-room"


def test_models_rooms_users():
    """It should be possible to attach users to a room."""
    room = RoomFactory()
    user = UserFactory()
    room.users.add(user)
    room.refresh_from_db()

    assert list(room.users.all()) == [user]


def test_models_rooms_access_level_default():
    """A room should be public by default."""
    room = Room.objects.create(name="room")
    assert room.access_level == RoomAccessLevel.PUBLIC


# Access rights methods


def test_models_rooms_access_rights_none(django_assert_num_queries):
    """Calling access rights methods with None should return None."""
    room = RoomFactory()

    with django_assert_num_queries(0):
        assert room.get_role(None) is None
    with django_assert_num_queries(0):
        assert room.is_administrator_or_owner(None) is False
    with django_assert_num_queries(0):
        assert room.is_owner(None) is False


def test_models_rooms_access_rights_anonymous(django_assert_num_queries):
    """Check access rights methods on the room object for an anonymous user."""
    user = AnonymousUser()
    room = RoomFactory()

    with django_assert_num_queries(0):
        assert room.get_role(user) is None
    with django_assert_num_queries(0):
        assert room.is_administrator_or_owner(user) is False
    with django_assert_num_queries(0):
        assert room.is_owner(user) is False


def test_models_rooms_access_rights_authenticated(django_assert_num_queries):
    """Check access rights methods on the room object for an unrelated user."""
    user = UserFactory()
    room = RoomFactory()

    with django_assert_num_queries(1):
        assert room.get_role(user) is None
    with django_assert_num_queries(1):
        assert room.is_administrator_or_owner(user) is False
    with django_assert_num_queries(1):
        assert room.is_owner(user) is False


def test_models_rooms_access_rights_member_direct(django_assert_num_queries):
    """Check access rights methods on the room object for a direct member."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "member")])

    with django_assert_num_queries(1):
        assert room.get_role(user) == "member"
    with django_assert_num_queries(1):
        assert room.is_administrator_or_owner(user) is False
    with django_assert_num_queries(1):
        assert room.is_owner(user) is False


def test_models_rooms_access_rights_administrator_direct(django_assert_num_queries):
    """The is_administrator method should return True for a direct administrator."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "administrator")])

    with django_assert_num_queries(1):
        assert room.get_role(user) == "administrator"
    with django_assert_num_queries(1):
        assert room.is_administrator_or_owner(user) is True
    with django_assert_num_queries(1):
        assert room.is_owner(user) is False


def test_models_rooms_access_rights_owner_direct(django_assert_num_queries):
    """Check access rights methods on the room object for an owner."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])

    with django_assert_num_queries(1):
        assert room.get_role(user) == "owner"
    with django_assert_num_queries(1):
        assert room.is_administrator_or_owner(user) is True
    with django_assert_num_queries(1):
        assert room.is_owner(user) is True


def test_models_rooms_is_public_property():
    """Test the is_public property returns correctly based on access_level."""
    # Test public room
    public_room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    assert public_room.is_public is True

    # Test non-public room
    private_room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    assert private_room.is_public is False


@mock.patch.object(Room, "generate_unique_pin_code")
def test_telephony_disabled_skips_pin_generation(
    mock_generate_unique_pin_code, settings
):
    """Telephony disabled should not generate pin codes."""

    settings.ROOM_TELEPHONY_ENABLED = False

    room = RoomFactory()

    mock_generate_unique_pin_code.assert_not_called()
    assert room.pin_code is None


def test_default_and_custom_pin_length(settings):
    """Pin codes should be created with correct configured length."""

    settings.ROOM_TELEPHONY_ENABLED = True

    room = RoomFactory()

    # Assert default value is 10 for collision reasons
    assert len(room.pin_code) == 10

    settings.ROOM_TELEPHONY_PIN_LENGTH = 5

    room = RoomFactory()

    # Assert custom size
    assert len(room.pin_code) == 5


def test_room_updates_preserve_pin_code(settings):
    """Room updates should preserve existing pin code."""

    settings.ROOM_TELEPHONY_ENABLED = True

    room = RoomFactory()

    # Store the original pin code to compare after updates
    previous_pin_code = room.pin_code

    # If this method is called, it would indicate the pin is being regenerated unnecessarily
    with mock.patch.object(
        Room, "generate_unique_pin_code"
    ) as mock_generate_unique_pin_code:
        # Explicitly call save to persist the changes to the room
        room.slug = "aaa-aaaa-aaa"
        room.save()
        assert room.pin_code == previous_pin_code
        mock_generate_unique_pin_code.assert_not_called()


@pytest.mark.parametrize("is_telephony_enabled", [True, False])
def test_manual_pin_code_updates(is_telephony_enabled, settings):
    """Manual pin code changes should persist regardless of telephony setting."""

    settings.ROOM_TELEPHONY_ENABLED = is_telephony_enabled
    settings.ROOM_TELEPHONY_PIN_LENGTH = 5

    room = RoomFactory()
    assert room.pin_code != "12345"

    room.pin_code = "12345"
    room.save()

    assert room.pin_code == "12345"

    # No data validation when manual updates are made
    room.pin_code = "123"
    room.save()

    assert room.pin_code == "123"


def test_pin_code_uniqueness(settings):
    """Duplicate pin codes should raise validation error."""

    settings.ROOM_TELEPHONY_ENABLED = True
    settings.ROOM_TELEPHONY_PIN_LENGTH = 5

    RoomFactory(pin_code="12345")

    with pytest.raises(ValidationError) as excinfo:
        RoomFactory(pin_code="12345")

    assert "Room with this Room PIN code already exists." in str(excinfo.value)


@pytest.mark.parametrize("invalid_length", [0, 1, 2, 3])
def test_pin_code_minimum_length(invalid_length, settings):
    """Pin codes should enforce minimum length for security."""

    settings.ROOM_TELEPHONY_ENABLED = True
    settings.ROOM_TELEPHONY_PIN_LENGTH = 4

    # Assert no exception is raised with a valid length
    RoomFactory()

    settings.ROOM_TELEPHONY_PIN_LENGTH = invalid_length

    with pytest.raises(ValueError) as excinfo:
        RoomFactory()

    assert "PIN code length must be at least 4 digits for minimal security" in str(
        excinfo.value
    )


@mock.patch.object(Logger, "warning")
@mock.patch.object(secrets, "randbelow", return_value=12345)
def test_pin_generation_max_retries(mock_randbelow, mock_logger, settings):
    """Pin generation should give up after max retries."""

    settings.ROOM_TELEPHONY_ENABLED = True
    settings.ROOM_TELEPHONY_PIN_LENGTH = 5

    RoomFactory(pin_code="12345")

    # Assert default max retries is low, 5
    room1 = RoomFactory()
    assert mock_randbelow.call_count == 5
    assert room1.pin_code is None

    mock_logger.assert_called_once_with(
        "Failed to generate unique PIN code of length %s after %s attempts", 5, 5
    )

    mock_logger.reset_mock()
    mock_randbelow.reset_mock()
    settings.ROOM_TELEPHONY_PIN_MAX_RETRIES = 3

    room2 = RoomFactory()
    assert mock_randbelow.call_count == 3
    assert room2.pin_code is None

    mock_logger.assert_called_once_with(
        "Failed to generate unique PIN code of length %s after %s attempts", 5, 3
    )


@mock.patch.object(secrets, "randbelow", return_value=12345)
def test_pin_code_zero_padding(mock_randbelow, settings):
    """Pin codes should be zero-padded to meet required length."""

    settings.ROOM_TELEPHONY_ENABLED = True
    settings.ROOM_TELEPHONY_PIN_LENGTH = 10

    room = RoomFactory()
    assert room.pin_code == "0000012345"


@mock.patch.object(secrets, "randbelow", return_value=12345)
def test_pin_generation_upper_bound(mock_randbelow, settings):
    """Random number generator should use correct upper bound based on pin length."""

    settings.ROOM_TELEPHONY_ENABLED = False

    room = RoomFactory()

    room.generate_unique_pin_code(length=5)

    # Assert called with the right exclusive upper bound, 10^5
    mock_randbelow.assert_called_with(100000)
