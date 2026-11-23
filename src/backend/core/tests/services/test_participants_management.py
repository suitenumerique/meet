"""Tests for the ParticipantsManagement service."""

# pylint: disable=redefined-outer-name,no-name-in-module

from unittest import mock

import pytest
from livekit.api import RoomParticipantIdentity, TwirpError
from livekit.protocol.models import ParticipantInfo

from core.services.participants_management import (
    ParticipantNotFoundException,
    ParticipantsManagement,
    ParticipantsManagementException,
)


@pytest.fixture
def mock_livekit_client():
    """Mock LiveKit API client."""
    with mock.patch("core.utils.create_livekit_client") as mock_create:
        mock_client = mock.AsyncMock()
        mock_create.return_value = mock_client
        yield mock_client


def test_get_participant_returns_connected_participant(mock_livekit_client):
    """A connected participant is returned as LiveKit describes it."""
    participant = ParticipantInfo(
        identity="identity",
        state=ParticipantInfo.State.ACTIVE,
        attributes={"room_role": "member"},
    )
    mock_livekit_client.room.get_participant.return_value = participant

    assert ParticipantsManagement().get_participant("room", "identity") == participant

    mock_livekit_client.room.get_participant.assert_called_once_with(
        RoomParticipantIdentity(room="room", identity="identity")
    )
    mock_livekit_client.aclose.assert_called_once()


def test_get_participant_disconnected(mock_livekit_client):
    """A disconnected participant is reported as not found."""
    mock_livekit_client.room.get_participant.return_value = ParticipantInfo(
        identity="identity",
        state=ParticipantInfo.State.DISCONNECTED,
    )

    with pytest.raises(ParticipantNotFoundException):
        ParticipantsManagement().get_participant("room", "identity")

    mock_livekit_client.aclose.assert_called_once()


def test_get_participant_not_found(mock_livekit_client):
    """A participant unknown to LiveKit is reported as not found."""
    mock_livekit_client.room.get_participant.side_effect = TwirpError(
        msg="participant does not exist", code="not_found", status=404
    )

    with pytest.raises(ParticipantNotFoundException):
        ParticipantsManagement().get_participant("room", "identity")

    mock_livekit_client.aclose.assert_called_once()


def test_get_participant_livekit_error(mock_livekit_client):
    """Any other LiveKit error is not mistaken for an absent participant."""
    mock_livekit_client.room.get_participant.side_effect = TwirpError(
        msg="an error occurred", code="internal", status=500
    )

    with pytest.raises(ParticipantsManagementException) as error:
        ParticipantsManagement().get_participant("room", "identity")

    assert error.type is ParticipantsManagementException
    mock_livekit_client.aclose.assert_called_once()
