"""Audit logging with custom serializers."""

from core.audit import getLogger as get_logger_base
from core.models import Room


def serialize_room(room: Room):
    return {
        "name": room.name,
        "slug": room.slug,
        "access_level": room.access_level,
    }


custom_serializers = [(Room, serialize_room)]


def getLogger(name: str | None = None):
    return get_logger_base(name=name, custom_serializers=custom_serializers)
