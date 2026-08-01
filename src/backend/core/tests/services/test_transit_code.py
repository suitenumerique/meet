"""
Unit tests for the TransitCodeService.
"""

import pytest

from core.factories import UserFactory
from core.services.transit_code import TransitCodeService

pytestmark = pytest.mark.django_db


def test_create_code_returns_unique_opaque_codes():
    """Each created code should be a distinct high-entropy string."""
    user = UserFactory()
    service = TransitCodeService()

    codes = {service.create_code(user) for _ in range(5)}

    assert len(codes) == 5
    for code in codes:
        assert len(code) >= 43


def test_consume_code_returns_stored_data_once():
    """Consuming a code should return its data exactly once."""
    user = UserFactory()
    service = TransitCodeService()

    code = service.create_code(user, client_id="my-app")

    assert service.consume_code(code) == {
        "user_id": str(user.id),
        "client_id": "my-app",
    }
    # Single use: a second consumption fails
    assert service.consume_code(code) is None


def test_consume_code_unknown_or_empty():
    """Unknown or empty codes should not be consumable."""
    service = TransitCodeService()

    assert service.consume_code("unknown-code") is None
    assert service.consume_code("") is None
    assert service.consume_code(None) is None
