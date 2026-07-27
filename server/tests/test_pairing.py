"""Tests for /v1/pair/exchange."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from utto_server.models import Device, PairingCode, Relationship


class TestPairExchange:
    """Test POST /v1/pair/exchange."""

    def test_exchange_with_valid_code_returns_token_and_relationship(
        self, client: TestClient, active_pairing_code: str
    ):
        """A valid pairing code returns a device token and relationship info."""
        response = client.post("/v1/pair/exchange", json={"pairing_code": active_pairing_code})

        assert response.status_code == 200
        data = response.json()
        assert "device_token" in data
        assert len(data["device_token"]) > 20
        assert "relationship_id" in data
        assert data["display_name"] == "熠"
        assert "Pairing successful" in data["message"]

    def test_exchange_with_invalid_code_returns_403(self, client: TestClient):
        """A non-existent pairing code returns 403."""
        response = client.post("/v1/pair/exchange", json={"pairing_code": "nonexistent"})
        assert response.status_code == 403

    def test_exchange_with_expired_code_returns_403(
        self, client: TestClient, expired_pairing_code: str
    ):
        """An expired pairing code returns 403."""
        response = client.post("/v1/pair/exchange", json={"pairing_code": expired_pairing_code})
        assert response.status_code == 403

    def test_exchange_with_used_code_returns_403(self, client: TestClient, used_pairing_code: str):
        """A pairing code that was already used returns 403."""
        response = client.post("/v1/pair/exchange", json={"pairing_code": used_pairing_code})
        assert response.status_code == 403

    def test_exchange_marks_code_as_used(
        self, client: TestClient, db: Session, active_pairing_code: str
    ):
        """After exchange, the pairing code is marked as used in the database."""
        client.post("/v1/pair/exchange", json={"pairing_code": active_pairing_code})

        pairing = db.query(PairingCode).filter(PairingCode.code == active_pairing_code).first()
        assert pairing is not None
        assert pairing.used_at is not None

    def test_exchange_code_cannot_be_used_twice(self, client: TestClient, active_pairing_code: str):
        """A pairing code can only be used once."""
        first = client.post("/v1/pair/exchange", json={"pairing_code": active_pairing_code})
        assert first.status_code == 200

        second = client.post("/v1/pair/exchange", json={"pairing_code": active_pairing_code})
        assert second.status_code == 403

    def test_exchange_stores_token_hash_not_plaintext(
        self, client: TestClient, db: Session, active_pairing_code: str
    ):
        """The database only stores the SHA-256 hash of the device token, not the token itself."""
        response = client.post("/v1/pair/exchange", json={"pairing_code": active_pairing_code})
        raw_token = response.json()["device_token"]

        device = db.query(Device).first()
        assert device is not None
        # The stored value should NOT be the raw token
        assert device.token_hash != raw_token
        # It should be a 64-char hex string (SHA-256)
        assert len(device.token_hash) == 64

    def test_exchange_creates_single_relationship(
        self, client: TestClient, db: Session, active_pairing_code: str
    ):
        """Pairing creates only one relationship; second pairing reuses it."""
        client.post("/v1/pair/exchange", json={"pairing_code": active_pairing_code})

        # Create another pairing code
        from datetime import timedelta

        code2 = "second-code-3456"
        expires2 = datetime.now(UTC) + timedelta(minutes=15)
        db.add(PairingCode(code=code2, expires_at=expires2))
        db.commit()

        client.post("/v1/pair/exchange", json={"pairing_code": code2})

        # There should be exactly one active relationship
        relationships = db.query(Relationship).filter(Relationship.status == "active").all()
        assert len(relationships) == 1

    def test_exchange_different_codes_get_different_tokens(
        self, client: TestClient, db: Session, active_pairing_code: str
    ):
        """Each pairing exchange generates a unique device token."""
        first = client.post("/v1/pair/exchange", json={"pairing_code": active_pairing_code})
        token1 = first.json()["device_token"]

        code2 = "another-code-7890"
        expires2 = datetime.now(UTC) + timedelta(minutes=15)
        db.add(PairingCode(code=code2, expires_at=expires2))
        db.commit()

        second = client.post("/v1/pair/exchange", json={"pairing_code": code2})
        token2 = second.json()["device_token"]

        assert token1 != token2

    def test_exchange_creates_separate_device_records(
        self, client: TestClient, db: Session, active_pairing_code: str
    ):
        """Each pairing exchange creates a new Device row."""
        client.post("/v1/pair/exchange", json={"pairing_code": active_pairing_code})

        code2 = "device-code-1122"
        expires2 = datetime.now(UTC) + timedelta(minutes=15)
        db.add(PairingCode(code=code2, expires_at=expires2))
        db.commit()

        client.post("/v1/pair/exchange", json={"pairing_code": code2})

        devices = db.query(Device).all()
        assert len(devices) == 2
