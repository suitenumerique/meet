"""
Test utils.is_uuid
"""

import pytest
from faker import Faker

from core import utils

fake = Faker()

UUID = fake.uuid4()


@pytest.mark.parametrize(
    "value",
    [
        UUID,
        UUID.upper(),
        UUID.replace("-", ""),
        f"{{{UUID}}}",
        f"urn:uuid:{UUID}",
    ],
    ids=["canonical", "uppercase", "hex", "braces", "urn"],
)
def test_utils_is_uuid_true(value):
    """Strings that parse as a UUID should be recognized."""
    assert utils.is_uuid(value) is True


@pytest.mark.parametrize(
    "value",
    ["", "my-room", "abc-defg-hij", f"{UUID}!", f"_{UUID}", UUID[:-1]],
    ids=["empty", "slug", "room-slug", "suffix", "prefix", "truncated"],
)
def test_utils_is_uuid_false(value):
    """Strings that do not parse as a UUID should not be recognized."""
    assert utils.is_uuid(value) is False
