"""What the Elastic Common Schema says about audit events.

Reference:
- https://github.com/elastic/ecs/blob/v9.5.0/schemas/event.yml
- https://github.com/elastic/ecs/blob/v9.5.0/schemas/entity.yml
"""

from collections.abc import Iterable

from django.conf import settings

from .enums import EventCategory, EventType

ECS_VERSION = "9.5.0"

# The category of an event that names none, as an API call
DEFAULT_CATEGORY = EventCategory.API

# ``expected_event_types`` of the categories in ``EventCategory``
EXPECTED_EVENT_TYPES: dict[EventCategory, frozenset[EventType]] = {
    EventCategory.API: frozenset(
        {
            EventType.ACCESS,
            EventType.ADMIN,
            EventType.ALLOWED,
            EventType.CHANGE,
            EventType.CREATION,
            EventType.DELETION,
            EventType.DENIED,
            EventType.END,
            EventType.INFO,
            EventType.START,
            EventType.USER,
        }
    ),
    EventCategory.AUTHENTICATION: frozenset(
        {EventType.START, EventType.END, EventType.INFO}
    ),
    EventCategory.CONFIGURATION: frozenset(
        {
            EventType.ACCESS,
            EventType.CHANGE,
            EventType.CREATION,
            EventType.DELETION,
            EventType.INFO,
        }
    ),
    EventCategory.EMAIL: frozenset({EventType.INFO}),
    EventCategory.FILE: frozenset(
        {
            EventType.ACCESS,
            EventType.CHANGE,
            EventType.CREATION,
            EventType.DELETION,
            EventType.INFO,
        }
    ),
    EventCategory.IAM: frozenset(
        {
            EventType.ADMIN,
            EventType.CHANGE,
            EventType.CREATION,
            EventType.DELETION,
            EventType.GROUP,
            EventType.INFO,
            EventType.USER,
        }
    ),
    EventCategory.SESSION: frozenset({EventType.START, EventType.END, EventType.INFO}),
    EventCategory.WEB: frozenset({EventType.ACCESS, EventType.ERROR, EventType.INFO}),
}

# Allowed values of ``entity.type``
ENTITY_TYPES = frozenset(
    {
        "application",
        "bucket",
        "cloud",
        "container",
        "database",
        "function",
        "host",
        "orchestrator",
        "queue",
        "service",
        "session",
        "user",
    }
)


def is_expected(categories: Iterable[EventCategory], event_type: EventType) -> bool:
    """Tell whether one of ``categories`` expects ``event_type``."""
    return any(event_type in EXPECTED_EVENT_TYPES[category] for category in categories)


def check_classification(
    categories: Iterable[EventCategory | str], types: Iterable[EventType | str]
) -> None:
    """Raise ``ValueError`` unless every type is expected by one of the categories."""
    categories = [EventCategory(category) for category in categories]
    unexpected = [
        str(event_type)
        for event_type in (EventType(item) for item in types)
        if not is_expected(categories, event_type)
    ]
    if unexpected:
        raise ValueError(
            f"ECS {ECS_VERSION} does not expect event type {', '.join(unexpected)} "
            f"in category {', '.join(str(category) for category in categories)}"
        )


def dataset() -> str:
    """Return the dataset of audit events, ``<service>.audit``."""
    service_name = settings.AUDIT_LOG_SERVICE_NAME
    return f"{service_name}.audit".lower().replace("-", "_")


def stream_fields() -> dict[str, dict[str, str]]:
    """Return the ``data_stream`` and ``event.dataset`` fields of audit events."""
    name = dataset()
    return {
        "data_stream": {
            "type": "logs",
            "dataset": name,
            "namespace": settings.AUDIT_LOG_DATA_STREAM_NAMESPACE,
        },
        "event": {"dataset": name},
    }
