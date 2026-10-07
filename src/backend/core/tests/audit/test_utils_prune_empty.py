"""
Test audit.utils.prune_empty
"""

from core.audit.utils import prune_empty


def test_prune_empty_drops_none_and_empty_mappings():
    """Should drop None and emptied mappings but keep falsy values."""
    document = {
        "none": None,
        "emptied": {"inner": None, "deeper": {"again": None}},
        "kept": {"zero": 0, "false": False, "blank": "", "none": None},
        "list": [],
    }

    assert prune_empty(document) == {
        "kept": {"zero": 0, "false": False, "blank": ""},
        "list": [],
    }


def test_prune_empty_leaves_non_mappings_untouched():
    """Should return anything that is not a mapping as it is."""
    assert prune_empty([None, {}]) == [None, {}]
    assert prune_empty("text") == "text"
    assert prune_empty(None) is None
