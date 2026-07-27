from fastapi.testclient import TestClient

from utto_server.main import app


def test_health_returns_expected_payload() -> None:
    with TestClient(app) as client:
        response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "utto-server"}
