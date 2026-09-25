"""Catalog of all analytics events emitted by the backend."""

from enum import StrEnum


class AnalyticsEvent(StrEnum):
    """All trackable events. Values are the wire names sent to the provider."""

    # Rooms
    ROOM_CREATED = "room_created"
    ROOM_UPDATED = "room_updated"

    # Roomkit (meeting-room SIP devices)
    ROOMKIT_JOINED = "roomkit_joined"
