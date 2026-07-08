"""
Test rooms API endpoints in the Meet core app: update.
"""

import random
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from ...factories import RoomFactory, UserFactory
from ...models import RoomAccessLevel
from ...services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)

pytestmark = pytest.mark.django_db


def test_api_rooms_update_anonymous():
    """Anonymous users should not be allowed to update a room."""
    room = RoomFactory(name="Old name")
    client = APIClient()

    response = client.put(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "name": "New name",
        },
    )
    assert response.status_code == 401
    room.refresh_from_db()
    assert room.name == "Old name"
    assert room.slug == "old-name"


def test_api_rooms_update_authenticated():
    """Authenticated users should not be allowed to update a room."""
    user = UserFactory()
    room = RoomFactory(name="Old name")
    client = APIClient()
    client.force_login(user)

    response = client.put(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "name": "New name",
        },
    )
    assert response.status_code == 403
    room.refresh_from_db()
    assert room.name == "Old name"
    assert room.slug == "old-name"


def test_api_rooms_update_members():
    """
    Users who are members of a room but not administrators should
    not be allowed to update it.
    """
    user = UserFactory()
    room = RoomFactory(
        access_level=RoomAccessLevel.PUBLIC, name="Old name", users=[(user, "member")]
    )
    client = APIClient()
    client.force_login(user)

    response = client.put(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "name": "New name",
            "slug": "should-be-ignored",
            "access_level": RoomAccessLevel.RESTRICTED,
            "configuration": {"can_publish_sources": ["camera", "microphone"]},
        },
        format="json",
    )
    assert response.status_code, 403
    room.refresh_from_db()
    assert room.name == "Old name"
    assert room.slug == "old-name"
    assert room.access_level != RoomAccessLevel.RESTRICTED
    assert room.configuration == {}


@patch.object(RoomManagement, "update_metadata")
def test_api_rooms_update_administrators(mock_update_metadata):
    """Should sync LiveKit metadata when both configuration and access level change."""
    user = UserFactory()
    room = RoomFactory(
        access_level=RoomAccessLevel.RESTRICTED,
        users=[(user, random.choice(["administrator", "owner"]))],
        configuration={"can_publish_sources": ["camera"]},
    )
    client = APIClient()
    client.force_login(user)

    response = client.put(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "name": "New name",
            "slug": "should-be-ignored",
            "access_level": RoomAccessLevel.PUBLIC,
            "configuration": {"can_publish_sources": ["camera", "microphone"]},
        },
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.name == "New name"
    assert room.slug == "new-name"
    assert room.access_level == RoomAccessLevel.PUBLIC
    assert room.configuration == {"can_publish_sources": ["camera", "microphone"]}

    mock_update_metadata.assert_called_once_with(
        room_name=str(room.id),
        metadata={
            "access_level": "public",
            "configuration": {"can_publish_sources": ["camera", "microphone"]},
        },
    )


@patch.object(RoomManagement, "update_metadata")
def test_api_rooms_update_administrators_configuration_only(mock_update_metadata):
    """Should sync LiveKit metadata when only configuration changes."""
    user = UserFactory()
    room = RoomFactory(
        access_level=RoomAccessLevel.RESTRICTED,
        users=[(user, random.choice(["administrator", "owner"]))],
        configuration={},
    )
    client = APIClient()
    client.force_login(user)

    response = client.put(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "name": "New name",
            "slug": "should-be-ignored",
            "configuration": {"can_publish_sources": ["camera", "microphone"]},
        },
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.name == "New name"
    assert room.slug == "new-name"
    assert room.access_level == RoomAccessLevel.RESTRICTED
    assert room.configuration == {"can_publish_sources": ["camera", "microphone"]}

    mock_update_metadata.assert_called_once_with(
        room_name=str(room.id),
        metadata={
            "access_level": "restricted",
            "configuration": {"can_publish_sources": ["camera", "microphone"]},
        },
    )


@patch.object(RoomManagement, "update_metadata")
def test_api_rooms_update_administrators_access_level_only(mock_update_metadata):
    """Should sync LiveKit metadata when only access level changes."""
    user = UserFactory()
    room = RoomFactory(
        access_level=RoomAccessLevel.RESTRICTED,
        users=[(user, random.choice(["administrator", "owner"]))],
        configuration={"can_publish_sources": ["camera"]},
    )
    client = APIClient()
    client.force_login(user)

    response = client.put(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "name": "New name",
            "access_level": RoomAccessLevel.PUBLIC,
        },
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.name == "New name"
    assert room.slug == "new-name"
    assert room.access_level == RoomAccessLevel.PUBLIC
    assert room.configuration == {"can_publish_sources": ["camera"]}

    mock_update_metadata.assert_called_once_with(
        room_name=str(room.id),
        metadata={
            "access_level": "public",
            "configuration": {"can_publish_sources": ["camera"]},
        },
    )


@patch.object(RoomManagement, "update_metadata")
def test_api_rooms_update_administrators_name_only(mock_update_metadata):
    """Should not sync LiveKit metadata when neither configuration nor access level changes."""
    user = UserFactory()
    room = RoomFactory(
        name="Old name",
        access_level=RoomAccessLevel.PUBLIC,
        configuration={"can_publish_sources": ["camera"]},
        users=[(user, random.choice(["administrator", "owner"]))],
    )
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"name": "New name"},
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.name == "New name"
    assert room.slug == "new-name"
    # Unrelated fields untouched
    assert room.access_level == RoomAccessLevel.PUBLIC
    assert room.configuration == {"can_publish_sources": ["camera"]}

    mock_update_metadata.assert_not_called()


@pytest.mark.parametrize(
    "configuration",
    [
        {"can_publish_sources": ["camera", "microphone"]},
        {
            "can_publish_sources": [
                "camera",
                "microphone",
                "screen_share",
                "screen_share_audio",
            ]
        },
        {"can_publish_sources": []},
        {"can_publish_sources": None},
        {"can_publish_sources": None, "everyone_can_mute": True},
        {"can_publish_sources": None, "everyone_can_mute": False},
        {"can_publish_sources": None, "everyone_can_mute": "yes"},
        {"can_publish_sources": None, "everyone_can_mute": "1"},
    ],
)
@patch.object(RoomManagement, "update_metadata")
def test_api_rooms_update_configuration_valid(mock_update_metadata, configuration):
    """Administrators should be allowed to set valid configurations."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")], configuration={})
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"configuration": configuration},
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.configuration == configuration

    mock_update_metadata.assert_called_once()


@patch.object(RoomManagement, "update_metadata")
def test_api_rooms_update_configuration_unchanged_empty(mock_update_metadata):
    """Should not sync LiveKit metadata when patching an already empty configuration."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")], configuration={})
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"configuration": {}},
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.configuration == {}

    mock_update_metadata.assert_not_called()


def test_api_rooms_update_configuration_extra_keys_rejected():
    """Extra keys in configuration should be rejected."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {
            "configuration": {
                "can_publish_sources": ["camera"],
                "arbitrary_key": "value",
            }
        },
        format="json",
    )
    assert response.status_code == 400
    room.refresh_from_db()
    assert room.configuration == {}


@pytest.mark.parametrize("invalid_source", ["invalid_source", "CAMERA"])
def test_api_rooms_update_configuration_invalid_source_value(invalid_source):
    """Invalid source values should be rejected."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"configuration": {"can_publish_sources": [invalid_source]}},
        format="json",
    )
    assert response.status_code == 400
    room.refresh_from_db()
    assert room.configuration == {}


def test_api_rooms_update_configuration_wrong_type():
    """Configuration values with wrong types should be rejected."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"configuration": {"can_publish_sources": "camera"}},
        format="json",
    )
    assert response.status_code == 400
    room.refresh_from_db()
    assert room.configuration == {}


@pytest.mark.parametrize("invalid_value", ["test", [], {}])
def test_api_rooms_update_configuration_everyone_can_mute_wrong_type(invalid_value):
    """everyone_can_mute values with wrong types should be rejected."""
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"configuration": {"everyone_can_mute": invalid_value}},
        format="json",
    )
    assert response.status_code == 400
    room.refresh_from_db()
    assert room.configuration == {}


def test_api_rooms_update_administrators_of_another():
    """
    Being administrator or owner of a room should not grant authorization to update
    another room.
    """
    user = UserFactory()
    RoomFactory(users=[(user, random.choice(["administrator", "owner"]))])
    other_room = RoomFactory(name="Old name")
    client = APIClient()
    client.force_login(user)

    response = client.put(
        f"/api/v1.0/rooms/{other_room.id!s}/",
        {"name": "New name", "slug": "should-be-ignored"},
    )
    assert response.status_code, 403
    other_room.refresh_from_db()
    assert other_room.name == "Old name"
    assert other_room.slug == "old-name"


@patch.object(RoomManagement, "update_metadata", side_effect=RoomNotFoundException)
def test_api_rooms_update_livekit_room_not_found(mock_update_metadata):
    """Should not fail the API request when the LiveKit room does not exist yet."""
    user = UserFactory()
    room = RoomFactory(
        users=[(user, random.choice(["administrator", "owner"]))],
        configuration={},
    )
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"configuration": {"can_publish_sources": ["camera"]}},
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.configuration == {"can_publish_sources": ["camera"]}

    mock_update_metadata.assert_called_once_with(
        room_name=str(room.id),
        metadata={
            "access_level": room.access_level,
            "configuration": {"can_publish_sources": ["camera"]},
        },
    )


@patch.object(RoomManagement, "update_metadata", side_effect=RoomManagementException)
def test_api_rooms_update_livekit_sync_failure(mock_update_metadata):
    """Should not fail the API request when the LiveKit metadata sync fails."""
    user = UserFactory()
    room = RoomFactory(
        users=[(user, random.choice(["administrator", "owner"]))],
        configuration={},
    )
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"configuration": {"can_publish_sources": ["camera"]}},
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.configuration == {"can_publish_sources": ["camera"]}

    mock_update_metadata.assert_called_once_with(
        room_name=str(room.id),
        metadata={
            "access_level": room.access_level,
            "configuration": {"can_publish_sources": ["camera"]},
        },
    )


@patch.object(RoomManagement, "update_metadata")
def test_api_rooms_update_access_level_not_allowed(mock_update_metadata, settings):
    """An access level outside RESOURCE_ALLOWED_ACCESS_LEVELS should be rejected."""
    settings.RESOURCE_ALLOWED_ACCESS_LEVELS = [
        RoomAccessLevel.TRUSTED,
        RoomAccessLevel.RESTRICTED,
    ]
    user = UserFactory()
    room = RoomFactory(
        access_level=RoomAccessLevel.RESTRICTED,
        users=[(user, random.choice(["administrator", "owner"]))],
    )
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"access_level": RoomAccessLevel.PUBLIC},
        format="json",
    )
    assert response.status_code == 400
    room.refresh_from_db()
    assert room.access_level == RoomAccessLevel.RESTRICTED
    mock_update_metadata.assert_not_called()


@patch.object(RoomManagement, "update_metadata")
def test_api_rooms_update_access_level_allowed(mock_update_metadata, settings):
    """An access level within RESOURCE_ALLOWED_ACCESS_LEVELS should be accepted."""
    settings.RESOURCE_ALLOWED_ACCESS_LEVELS = [
        RoomAccessLevel.TRUSTED,
        RoomAccessLevel.RESTRICTED,
    ]
    user = UserFactory()
    room = RoomFactory(
        access_level=RoomAccessLevel.TRUSTED,
        users=[(user, random.choice(["administrator", "owner"]))],
        configuration={},
    )
    client = APIClient()
    client.force_login(user)

    response = client.patch(
        f"/api/v1.0/rooms/{room.id!s}/",
        {"access_level": RoomAccessLevel.RESTRICTED},
        format="json",
    )
    assert response.status_code == 200
    room.refresh_from_db()
    assert room.access_level == RoomAccessLevel.RESTRICTED

    mock_update_metadata.assert_called_once_with(
        room_name=str(room.id),
        metadata={
            "access_level": "restricted",
            "configuration": {},
        },
    )
