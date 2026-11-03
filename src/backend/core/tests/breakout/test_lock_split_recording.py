"""
Opening a split and starting a recording, raced in two transactions, never both pass.
"""

# pylint: disable=W0621,W0613
import threading
from unittest import mock

from django.db import connection

import pytest
from rest_framework.test import APIClient

from core import models
from core.factories import RoomFactory, UserFactory, UserResourceAccessFactory

# The second request must wait on the row lock for this long before it may run.
PAUSE_SECONDS = 2


def owner_clients(room, count):
    """Clients logged in as the meeting's owner, one per thread."""
    user = UserFactory()
    UserResourceAccessFactory(resource=room, user=user, role="owner")
    clients = [APIClient() for _ in range(count)]
    for client in clients:
        client.force_login(user)
    return clients


def open_split(client, room):
    """POST a two-room split."""
    return client.post(
        f"/api/v1.0/rooms/{room.id!s}/breakout-sessions/",
        {
            "rooms": [
                {"name": "Room 1", "participants": [{"identity": "a", "name": "A"}]},
                {"name": "Room 2", "participants": [{"identity": "b", "name": "B"}]},
            ]
        },
        format="json",
    )


def start_recording(client, room):
    """POST a screen recording start."""
    return client.post(
        f"/api/v1.0/rooms/{room.id!s}/start-recording/",
        {"mode": "screen_recording"},
        format="json",
    )


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("first", ["split", "recording"])
def test_split_and_recording_never_both_pass(livekit, settings, first):
    """Whichever request takes the row first wins; the other answers 409."""
    settings.RECORDING_ENABLE = True
    room = RoomFactory()
    clients = owner_clients(room, 2)
    calls = {"split": open_split, "recording": start_recording}
    second = "recording" if first == "split" else "split"

    first_checked = threading.Event()
    second_done = threading.Event()
    statuses = {}
    managers = [models.BreakoutSession.objects, models.Recording.objects]
    real_creates = [manager.create for manager in managers]

    def pausing(real_create):
        # The first request has passed every check and holds the row: pause it
        # before its first write until the second request returns.
        def create(*args, **kwargs):
            if threading.current_thread().name == first:
                first_checked.set()
                second_done.wait(timeout=PAUSE_SECONDS)
            return real_create(*args, **kwargs)

        return create

    def run(name, client):
        try:
            statuses[name] = calls[name](client, room).status_code
        finally:
            if name == second:
                second_done.set()
            connection.close()

    with (
        mock.patch.object(managers[0], "create", pausing(real_creates[0])),
        mock.patch.object(managers[1], "create", pausing(real_creates[1])),
        mock.patch("core.api.viewsets.WorkerServiceMediator"),
    ):
        first_thread = threading.Thread(
            target=run, args=(first, clients[0]), name=first
        )
        first_thread.start()
        assert first_checked.wait(timeout=10)
        second_thread = threading.Thread(
            target=run, args=(second, clients[1]), name=second
        )
        second_thread.start()
        first_thread.join(timeout=30)
        second_thread.join(timeout=30)

    # The second request waits on the row lock, then sees the first one's row.
    assert statuses == {first: 201, second: 409}
    has_split = models.BreakoutSession.objects.filter(
        room=room, is_active=True
    ).exists()
    assert has_split is (first == "split")
    assert models.Recording.objects.filter(room=room).exists() is (first == "recording")
