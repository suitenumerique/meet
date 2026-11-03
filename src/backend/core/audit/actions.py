"""Specs of the actions audit events are emitted for."""

from dataclasses import dataclass

from .ecs import DEFAULT_CATEGORY, check_classification
from .enums import EventCategory, EventType


@dataclass(frozen=True)
class Action:
    """An audited action: its dotted name and its ECS classification.

    ``category`` and ``types`` are the defaults of every event of the action:
    a ``category`` or ``types`` given to ``log`` wins over them. Without a
    category, the action is an API call.
    """

    name: str
    category: EventCategory | None = None
    types: tuple[EventType, ...] = ()

    def __post_init__(self):
        """Validate the classification against ECS, so a bad one fails at import."""
        if self.category is not None:
            object.__setattr__(self, "category", EventCategory(self.category))
        object.__setattr__(self, "types", tuple(EventType(t) for t in self.types))
        check_classification([self.category or DEFAULT_CATEGORY], self.types)

    def __str__(self) -> str:
        return self.name
