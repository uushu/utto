"""Shared test fixtures for M1 backend tests."""

import tempfile
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from utto_server.database import get_db
from utto_server.main import app
from utto_server.models import Base, PairingCode

# File-based SQLite for reliable test isolation (avoids in-memory connection-pool issues).
_test_db_directory = tempfile.TemporaryDirectory(prefix="utto_test_")
TEST_DB_DIR = _test_db_directory.name
TEST_DATABASE_URL = f"sqlite:///{TEST_DB_DIR}/test.db"
_test_engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestSessionLocal = sessionmaker(bind=_test_engine, autoflush=False, autocommit=False)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Release the test database and remove its temporary directory."""
    _test_engine.dispose()
    _test_db_directory.cleanup()


@pytest.fixture
def db():
    """Return a fresh database session with tables created per test."""
    Base.metadata.create_all(bind=_test_engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        Base.metadata.drop_all(bind=_test_engine)


@pytest.fixture
def client(db: Session):
    """Return a TestClient that uses the test database session."""

    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def active_pairing_code(db: Session) -> str:
    """Create an active pairing code and return it."""
    code = "test-code-1234"
    expires_at = datetime.now(UTC) + timedelta(minutes=15)
    pairing = PairingCode(code=code, expires_at=expires_at)
    db.add(pairing)
    db.commit()
    return code


@pytest.fixture
def expired_pairing_code(db: Session) -> str:
    """Create an expired pairing code and return it."""
    code = "expired-code-5678"
    expires_at = datetime.now(UTC) - timedelta(minutes=5)
    pairing = PairingCode(code=code, expires_at=expires_at)
    db.add(pairing)
    db.commit()
    return code


@pytest.fixture
def used_pairing_code(db: Session) -> str:
    """Create a pairing code that has already been used and return it."""
    code = "used-code-9012"
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=15)
    pairing = PairingCode(code=code, expires_at=expires_at, used_at=now)
    db.add(pairing)
    db.commit()
    return code


@pytest.fixture
def device_token_and_relationship(client: TestClient, active_pairing_code: str) -> tuple[str, str]:
    """Pair a device and return (device_token, relationship_id)."""
    response = client.post("/v1/pair/exchange", json={"pairing_code": active_pairing_code})
    assert response.status_code == 200, f"Pairing failed: {response.json()}"
    data = response.json()
    return data["device_token"], data["relationship_id"]


@pytest.fixture
def auth_headers(device_token_and_relationship: tuple[str, str]) -> dict[str, str]:
    """Return Authorization headers with a valid device token."""
    token, _ = device_token_and_relationship
    return {"Authorization": f"Bearer {token}"}
