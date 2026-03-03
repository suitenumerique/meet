"""Unit test configuration — auto-marks all tests in this directory."""

from pathlib import Path

import pytest

UNIT_DIR = Path(__file__).parent


def pytest_collection_modifyitems(items):
    """Add the 'unit' marker to every test in the unit directory."""
    for item in items:
        if UNIT_DIR in item.path.parents:
            item.add_marker(pytest.mark.unit)
