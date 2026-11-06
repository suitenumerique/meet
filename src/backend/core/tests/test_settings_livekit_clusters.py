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
    """A valid list of clusters is accepted."""
    clusters = json.dumps(
        [livekit_cluster_entry("paris"), livekit_cluster_entry("lyon")]
    )

    with mock.patch.object(settings.Test, "LIVEKIT_CLUSTERS", clusters):
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
