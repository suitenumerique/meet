"""Tests that the conditional deletes of placements stay a single statement."""

from django.db import router
from django.db.models import signals
from django.db.models.deletion import Collector

from core.models import Placement


def test_placement_deletes_are_a_single_statement():
    """Deleting placements filtered on their epoch and SID must issue one DELETE
    statement, which Django does only while nothing listens for the deletion
    of a placement and no relation points at it."""
    collector = Collector(using=router.db_for_write(Placement))

    assert collector.can_fast_delete(Placement.objects.all()), (
        "The conditional deletes of placements (place(), the operations, the "
        "reconciliation, the room_finished webhook) must stay a single "
        "DELETE ... WHERE on epoch and SID, or a join can delete a placement "
        "whose SID another join just recorded: no relation may point at "
        "Placement"
    )
    for signal in (signals.pre_delete, signals.post_delete):
        assert not signal.has_listeners(Placement), (
            "No receiver may listen for the deletion of a placement: the "
            "conditional deletes of placements must stay a single "
            "DELETE ... WHERE on epoch and SID, or a join can delete a "
            "placement whose SID another join just recorded"
        )
