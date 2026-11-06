"""Unit tests for the validation of the LIVEKIT_CLUSTERS setting."""

import json
import re
from unittest import mock

import pytest

from core.tests.utils import livekit_cluster_entry

from meet import settings


def test_livekit_clusters_invalid_is_refused():
    """An invalid list of clusters stops the settings loading, naming the problem."""
    clusters = json.dumps([livekit_cluster_entry("paris", weight=-1)])

    with mock.patch.object(settings.Test, "LIVEKIT_CLUSTERS", clusters):
        with pytest.raises(ValueError, match=re.escape("LIVEKIT_CLUSTERS[0].weight")):
            settings.Test.post_setup()


def test_livekit_clusters_valid_is_accepted():
    """A valid list of clusters is accepted while telephony and roomkit are off."""
    clusters = json.dumps(
        [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon")]
    )

    with (
        mock.patch.object(settings.Test, "LIVEKIT_CLUSTERS", clusters),
        mock.patch.object(settings.Test, "ROOM_TELEPHONY_ENABLED", False),
        mock.patch.object(settings.Test, "ROOMKIT_ENABLED", False),
    ):
        settings.Test.post_setup()


def test_livekit_clusters_unset_skips_validation():
    """Unset, as in the Build configuration which has no LiveKit environment.

    LIVEKIT_CONFIGURATION, which the registry then falls back to, is not checked.
    """
    with (
        mock.patch.object(settings.Test, "LIVEKIT_CLUSTERS", None),
        mock.patch.object(
            settings.Test,
            "LIVEKIT_CONFIGURATION",
            {"url": None, "api_key": None, "api_secret": None},
        ),
    ):
        settings.Test.post_setup()


@pytest.mark.parametrize(
    "telephony,roomkit,enabled",
    [
        (True, False, "ROOM_TELEPHONY_ENABLED"),
        (False, True, "ROOMKIT_ENABLED"),
        (True, True, "ROOM_TELEPHONY_ENABLED and ROOMKIT_ENABLED"),
    ],
    ids=["telephony", "roomkit", "both"],
)
def test_livekit_clusters_several_with_telephony_are_refused(
    telephony, roomkit, enabled
):
    """Several clusters with telephony or roomkit stop the settings loading.

    Phone and roomkit callers reach the SIP server of one cluster before their PIN
    is known, so Django cannot route them. The message names the enabled settings.
    """
    clusters = json.dumps(
        [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon")]
    )

    with (
        mock.patch.object(settings.Test, "LIVEKIT_CLUSTERS", clusters),
        mock.patch.object(settings.Test, "ROOM_TELEPHONY_ENABLED", telephony),
        mock.patch.object(settings.Test, "ROOMKIT_ENABLED", roomkit),
    ):
        with pytest.raises(
            ValueError,
            match=f"^{enabled} cannot be combined with more than one LiveKit "
            "cluster, and LIVEKIT_CLUSTERS lists 2:",
        ):
            settings.Test.post_setup()


@pytest.mark.parametrize(
    "clusters",
    [None, json.dumps([livekit_cluster_entry("paris")])],
    ids=["unset", "listed"],
)
def test_livekit_clusters_single_with_telephony_is_accepted(clusters):
    """Telephony and roomkit work with a single cluster.

    It is either listed in LIVEKIT_CLUSTERS or, when that is unset, built from
    LIVEKIT_CONFIGURATION.
    """
    with (
        mock.patch.object(settings.Test, "LIVEKIT_CLUSTERS", clusters),
        mock.patch.object(settings.Test, "ROOM_TELEPHONY_ENABLED", True),
        mock.patch.object(settings.Test, "ROOMKIT_ENABLED", True),
    ):
        settings.Test.post_setup()
