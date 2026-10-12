"""Tests for the application's lifespan."""

import asyncio
from unittest.mock import Mock, patch

from summary.main import app, lifespan


def test_lifespan_shares_then_shuts_down_the_analytics_client():
    """The lifespan should share the analytics client, then flush it on shutdown."""
    analytics = Mock()

    async def run_lifespan():
        async with lifespan(app) as state:
            assert state == {"analytics": analytics}
            analytics.shutdown.assert_not_called()

    with patch("summary.main.get_analytics", return_value=analytics):
        asyncio.run(run_lifespan())

    analytics.shutdown.assert_called_once_with()
