"""Test the frontend configuration endpoint."""

from django.urls import reverse

import pytest
from rest_framework.test import APIClient


@pytest.mark.parametrize("room_max_participants", [None, 150])
def test_api_config_room_max_participants(settings, room_max_participants):
    """The frontend learns the participant limit it shows and warns about."""
    settings.ROOM_MAX_PARTICIPANTS = room_max_participants

    response = APIClient().get(reverse("config"))

    assert response.status_code == 200
    assert response.json()["room_max_participants"] == room_max_participants
