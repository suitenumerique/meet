"""Placement strategies, the rules picking the LiveKit cluster of a new placement.

LIVEKIT_PLACEMENT_STRATEGY names the strategy in use. It picks among candidates:
the LiveKit clusters that may receive new placements.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from fractions import Fraction
from secrets import SystemRandom

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count
from django.utils.module_loading import import_string

from core.models import Placement, Room

from .clusters import LiveKitClusterConfig


@dataclass(frozen=True, kw_only=True)
class PlacementContext:
    """What a placement strategy is told about the LiveKit room to place.

    `room` is the room the LiveKit room is named after, or None for a
    connection test room.
    """

    room_name: str
    room: Room | None = None


class PlacementStrategy(ABC):
    """A placement strategy, which picks the LiveKit cluster of a new placement.

    A strategy is instantiated each time a cluster is chosen
    """

    @abstractmethod
    def choose(
        self,
        candidates: tuple[LiveKitClusterConfig, ...],
        context: PlacementContext,
    ) -> LiveKitClusterConfig:
        """Return the candidate on which to place a LiveKit room.

        The candidates are the LiveKit clusters that may receive new placements,
        in registry order. There is at least one, and each weighs more than 0.
        """


class WeightedRandomStrategy(PlacementStrategy):
    """Pick LiveKit clusters at random, in proportion to their weights.

    Clusters of equal weights receive as many new placements on average, and
    with weights of 1 and 3, the second cluster receives three quarters of them.
    """

    def choose(
        self,
        candidates: tuple[LiveKitClusterConfig, ...],
        context: PlacementContext,
    ) -> LiveKitClusterConfig:
        """Return a candidate drawn with a probability proportional to its weight."""
        weights = [cluster.weight for cluster in candidates]
        return SystemRandom().choices(candidates, weights=weights)[0]


class RoundRobinStrategy(PlacementStrategy):
    """Pick the LiveKit clusters in turn, whatever their weights.

    The first new placement among candidates goes to the first of them, the
    next one to the second, and so on. Turns are counted in the Django cache,
    which all processes share, with a counter for each set of candidates.
    """

    @staticmethod
    def counter_key(candidates: tuple[LiveKitClusterConfig, ...]) -> str:
        """Return the cache key counting the placements made among candidates."""
        names = ",".join(cluster.name for cluster in candidates)
        return f"livekit-placement-round-robin_{names}"

    def choose(
        self,
        candidates: tuple[LiveKitClusterConfig, ...],
        context: PlacementContext,
    ) -> LiveKitClusterConfig:
        """Return the candidate whose turn it is.

        Should the counter vanish between its creation and its increment, the
        turn goes to the first candidate.
        """
        key = self.counter_key(candidates)
        cache.add(key, 0, timeout=None)
        try:
            count = cache.incr(key)
        except ValueError:
            count = 1
        return candidates[(count - 1) % len(candidates)]


class LeastPlacementsStrategy(PlacementStrategy):
    """Pick the LiveKit cluster holding the fewest placements for its weight.

    A cluster weighing twice as much as another is given twice as many
    placements. On a tie, the cluster registered first is picked. Rooms placed
    at the same moment may all go to the same cluster, as each of them is
    placed before the placements of the others are recorded.
    """

    def choose(
        self,
        candidates: tuple[LiveKitClusterConfig, ...],
        context: PlacementContext,
    ) -> LiveKitClusterConfig:
        """Return the candidate holding the fewest placements for its weight."""
        placement_counts = dict(
            Placement.objects.filter(
                cluster__in=[cluster.name for cluster in candidates]
            )
            .values_list("cluster")
            .annotate(Count("pk"))
            .order_by()
        )
        return min(
            candidates,
            key=lambda cluster: Fraction(
                placement_counts.get(cluster.name, 0), cluster.weight
            ),
        )


def get_placement_strategy() -> PlacementStrategy:
    """Return the placement strategy named by LIVEKIT_PLACEMENT_STRATEGY.

    It is looked up on every call and never while the settings load, so that a
    strategy may need applications that are not ready then, and a change of
    settings applies at once.
    """
    return import_string(settings.LIVEKIT_PLACEMENT_STRATEGY)()
