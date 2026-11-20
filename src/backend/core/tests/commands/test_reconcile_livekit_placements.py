"""Tests for the reconcile_livekit_placements management command."""

import logging
from io import StringIO

from django.core.management import CommandError, call_command

import pytest

from core.factories import RoomFactory
from core.livekit.reconciliation import ReconciliationReport, Tally
from core.models import Placement

pytestmark = pytest.mark.django_db

COMMAND_MODULE = "core.management.commands.reconcile_livekit_placements"

MARKED_ABSENT = (
    "LiveKit placements reconciled: 1 marked absent, 0 live again, 0 deleted, "
    "0 repaired, 0 adopted, 0 closed, 0 failed closes, 0 unreachable clusters, "
    "0 unregistered placements, 0 foreign rooms."
)


def call_reconcile(*args):
    """Run the command and return what it wrote on stdout."""
    out = StringIO()
    call_command("reconcile_livekit_placements", *args, stdout=out)
    return out.getvalue()


def test_reconcile_livekit_placements(fake_livekit_clusters):
    """The command reconciles placements once with the LiveKit rooms live on
    the clusters, here the single fallback one, then sums up what was done in
    one line."""
    listed = []
    fake_livekit_clusters.on_list = listed.append
    room = RoomFactory()
    Placement.objects.create(room_name=str(room.id), cluster="default", sid="RM_a")

    assert call_reconcile() == f"{MARKED_ABSENT}\n"
    assert Placement.objects.get().absent_since is not None
    assert listed == ["default"]


@pytest.mark.usefixtures("fake_livekit_clusters")
def test_reconcile_livekit_placements_dry_run():
    """A dry run sums up the actions it would take, and changes nothing."""
    room = RoomFactory()
    Placement.objects.create(room_name=str(room.id), cluster="default", sid="RM_a")

    assert call_reconcile("--dry-run") == f"[dry-run] {MARKED_ABSENT}\n"
    assert Placement.objects.get().absent_since is None


def test_reconcile_livekit_placements_unreachable_cluster(fake_livekit_clusters):
    """A cluster that cannot be listed does not fail the command: the summary
    counts it."""
    fake_livekit_clusters.errors["default", "list_rooms"] = TimeoutError()
    expected = ReconciliationReport()
    expected.counts[Tally.UNREACHABLE_CLUSTERS] = 1

    assert call_reconcile() == f"{expected.summary()}\n"


def test_reconcile_livekit_placements_unexpected_error(fake_livekit_clusters, caplog):
    """An unexpected error fails the command, once logged with its traceback,
    and nothing is summed up."""
    error = RuntimeError("a defect")
    fake_livekit_clusters.errors["default", "list_rooms"] = error
    out = StringIO()

    with (
        caplog.at_level(logging.ERROR, logger=COMMAND_MODULE),
        pytest.raises(
            CommandError,
            match=r"^The reconciliation of LiveKit placements failed, as logged\.$",
        ) as raised,
    ):
        call_command("reconcile_livekit_placements", stdout=out)

    assert raised.value.__cause__ is error
    assert not out.getvalue()
    [record] = caplog.records
    assert record.getMessage() == "The reconciliation of LiveKit placements failed"
    assert record.exc_info[1] is error
