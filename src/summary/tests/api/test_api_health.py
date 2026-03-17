"""Integration tests for the health check endpoints."""


class TestHeartbeat:
    """Tests for the /__heartbeat__ endpoint."""

    def test_returns_200(self, client):
        """The heartbeat endpoint responds with 200 OK without an api_key."""
        response = client.get("/__heartbeat__")

        assert response.status_code == 200


class TestLBHeartbeat:
    """Tests for the /__lbheartbeat__ endpoint."""

    def test_returns_200(self, client):
        """The LB heartbeat endpoint responds with 200 OK without an api_key."""
        response = client.get("/__lbheartbeat__")

        assert response.status_code == 200
