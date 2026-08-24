"""Tests for the presence cache and the cached presence check."""

# pylint: disable=W0212

from unittest import mock
from uuid import uuid4

from django.core.cache import cache

import pytest

from core.services.participants_management import (
    ParticipantNotFoundException,
    ParticipantsManagement,
    ParticipantsManagementException,
)
from core.services.presence import PresenceCache


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_presence_cache_hit_skips_livekit(mock_check):
    """A cached positive answer must not call LiveKit."""
    room_id, identity = str(uuid4()), "user-sub"
    PresenceCache().mark_present(room_id, identity)

    assert (
        ParticipantsManagement().check_if_in_meeting_cached(room_id, identity) is True
    )
    mock_check.assert_not_called()


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_presence_cache_miss_calls_livekit_and_caches_positive(mock_check):
    """On a miss, LiveKit is asked once and a positive answer is memoized."""
    mock_check.return_value = True
    room_id, identity = str(uuid4()), "user-sub"
    service = ParticipantsManagement()

    assert service.check_if_in_meeting_cached(room_id, identity) is True
    assert service.check_if_in_meeting_cached(room_id, identity) is True
    assert mock_check.call_count == 1


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_presence_negative_not_cached(mock_check):
    """Negative answers are never memoized."""
    mock_check.return_value = False
    room_id, identity = str(uuid4()), "user-sub"
    service = ParticipantsManagement()

    assert service.check_if_in_meeting_cached(room_id, identity) is False
    assert service.check_if_in_meeting_cached(room_id, identity) is False
    assert mock_check.call_count == 2


@mock.patch(
    "core.services.participants_management.ParticipantsManagement.check_if_in_meeting"
)
def test_presence_errors_propagate_and_cache_nothing(mock_check):
    """LiveKit errors propagate to the caller (which fails closed); nothing cached."""
    room_id, identity = str(uuid4()), "user-sub"

    for exc in (ParticipantNotFoundException(), ParticipantsManagementException()):
        mock_check.side_effect = exc
        with pytest.raises(type(exc)):
            ParticipantsManagement().check_if_in_meeting_cached(room_id, identity)
        assert cache.get(PresenceCache._get_cache_key(room_id, identity)) is None


def test_presence_clear_and_clear_room():
    """clear() removes one entry, clear_room() removes all entries of a room."""
    room_id, other_room = str(uuid4()), str(uuid4())
    presence = PresenceCache()
    presence.mark_present(room_id, "a")
    presence.mark_present(room_id, "b")
    presence.mark_present(other_room, "a")

    presence.clear(room_id, "a")
    assert presence.is_marked_present(room_id, "a") is False
    assert presence.is_marked_present(room_id, "b") is True

    presence.clear_room(room_id)
    assert presence.is_marked_present(room_id, "b") is False
    assert presence.is_marked_present(other_room, "a") is True


def test_presence_clear_room_scans_in_pages():
    """clear_room removes every match, even across several SCAN pages,
    and only within the room."""
    room_id, other_room = str(uuid4()), str(uuid4())
    presence = PresenceCache()
    for i in range(7):
        presence.mark_present(room_id, f"user-{i}")
    presence.mark_present(other_room, "user-0")

    # An itersize smaller than the match count forces delete_pattern to
    # page through several SCAN cursors rather than finish in one pass.
    with mock.patch("core.utils.CACHE_SCAN_ITERSIZE", 3):
        presence.clear_room(room_id)

    assert all(not presence.is_marked_present(room_id, f"user-{i}") for i in range(7))
    assert presence.is_marked_present(other_room, "user-0") is True
