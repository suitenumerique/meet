"""Specs of the actions audit events are emitted for."""

from dataclasses import dataclass

from .enums import EventCategory, EventType


@dataclass(frozen=True)
class Action:
    """An audited action: its dotted name and its ECS classification.

    ``category`` and ``types`` are the defaults of every event of the action:
    a ``category`` or ``types`` given to ``log`` wins over them.
    """

    name: str
    category: EventCategory | None = None
    types: tuple[EventType, ...] = ()

    def __post_init__(self):
        """Validate the classification, so a bad one fails at import."""
        if self.category is not None:
            object.__setattr__(self, "category", EventCategory(self.category))
        object.__setattr__(self, "types", tuple(EventType(t) for t in self.types))

    def __str__(self) -> str:
        return self.name
