"""Tests for GET /v1/bootstrap."""

from fastapi.testclient import TestClient


class TestBootstrap:
    """Test GET /v1/bootstrap."""

    def test_bootstrap_without_auth_returns_401(self, client: TestClient):
        """Requests without Authorization header are rejected."""
        response = client.get("/v1/bootstrap")
        assert response.status_code == 401

    def test_bootstrap_with_empty_token_returns_401(self, client: TestClient):
        """Requests with empty Bearer token are rejected."""
        response = client.get("/v1/bootstrap", headers={"Authorization": "Bearer "})
        assert response.status_code == 401

    def test_bootstrap_with_invalid_token_returns_401(self, client: TestClient):
        """Requests with an invalid token are rejected."""
        response = client.get("/v1/bootstrap", headers={"Authorization": "Bearer not-a-real-token"})
        assert response.status_code == 401

    def test_bootstrap_with_valid_token_returns_relationship(
        self, client: TestClient, auth_headers: dict[str, str]
    ):
        """A valid device token returns relationship info."""
        response = client.get("/v1/bootstrap", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "relationship_id" in data
        assert data["display_name"] == "熠"
        assert "persona" in data
        assert "device_last_seen" in data

    def test_bootstrap_returns_null_persona_when_none_exists(
        self, client: TestClient, auth_headers: dict[str, str]
    ):
        """When no persona exists, persona field is null."""
        response = client.get("/v1/bootstrap", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["persona"] is None

    def test_bootstrap_with_wrong_auth_format_returns_401(self, client: TestClient):
        """A non-Bearer Authorization scheme is rejected."""
        response = client.get("/v1/bootstrap", headers={"Authorization": "Basic dGVzdDp0ZXN0"})
        assert response.status_code == 401
