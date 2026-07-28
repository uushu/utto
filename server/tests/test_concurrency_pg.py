"""PostgreSQL real concurrent tests for M1 Backend pairing exchange.

Uses a real uvicorn server + threading.Barrier for true concurrent HTTP requests.

Usage:
    pytest tests/test_concurrency_pg.py -v

Requires DATABASE_URL pointing to a PostgreSQL instance.
"""

import json
import os
import secrets
import socket
import threading
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta

import pytest
import uvicorn
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from utto_server.models import Base, Device, PairingCode, Relationship

PG_URL = os.getenv("DATABASE_URL", "")
if not PG_URL.startswith("postgresql"):
    pytest.skip("DATABASE_URL not set to a PostgreSQL instance", allow_module_level=True)

_pg_engine = create_engine(PG_URL)
PgSession = sessionmaker(bind=_pg_engine, autoflush=False, autocommit=False)

# Hard timeout for all thread joins.
_THREAD_TIMEOUT = 15


def _find_free_port() -> int:
    """Return a free TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


_server_port: int = 0
_base_url: str = ""
_server_instance: uvicorn.Server | None = None


@pytest.fixture(scope="module")
def _server():
    """Start uvicorn on a dynamic port; shut down cleanly after all tests."""
    global _server_port, _base_url, _server_instance

    _server_port = _find_free_port()
    _base_url = f"http://127.0.0.1:{_server_port}"

    os.environ["DATABASE_URL"] = PG_URL
    config = uvicorn.Config(
        "utto_server.main:app",
        host="127.0.0.1",
        port=_server_port,
        log_level="error",
    )
    _server_instance = uvicorn.Server(config)

    t = threading.Thread(target=_server_instance.run, daemon=True)
    t.start()

    # Wait for server readiness.
    for _ in range(30):
        try:
            req = urllib.request.Request(f"{_base_url}/v1/health")
            with urllib.request.urlopen(req, timeout=1) as resp:
                if resp.status == 200:
                    break
        except Exception:
            pass
        time.sleep(0.5)
    else:
        _server_instance.should_exit = True
        raise RuntimeError("Server did not start within 15 seconds")

    yield

    # Clean shutdown.
    _server_instance.should_exit = True
    t.join(timeout=5)


@pytest.fixture(scope="function")
def _pg_schema():
    """Create and drop schema for each test."""
    Base.metadata.create_all(bind=_pg_engine)
    yield
    Base.metadata.drop_all(bind=_pg_engine)


def _http_post(path: str, body: dict) -> tuple[int, dict | None]:
    """Make an HTTP POST request; return (status_code, json_body or None)."""
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{_base_url}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, None


def _exchange(code: str, barrier: threading.Barrier, results: list):
    """HTTP pair_exchange, synchronized by barrier. Appends status + optional token."""
    barrier.wait(timeout=10)
    try:
        status, body = _http_post("/v1/pair/exchange", {"pairing_code": code})
        results.append(status)
        if status == 200 and body:
            results.append(body.get("device_token", ""))
    except Exception as e:
        results.append(f"error: {e}")


class TestRealConcurrentSameCode:
    """Test 1: Same pairing code, two concurrent threads — only one wins."""

    def test_concurrent_same_code_only_one_200(self, _server, _pg_schema):
        session = PgSession()
        try:
            code = f"conc1-{secrets.token_hex(4)}"
            expires = datetime.now(UTC) + timedelta(minutes=15)
            session.add(PairingCode(code=code, expires_at=expires))
            session.commit()
        finally:
            session.close()

        results = []
        barrier = threading.Barrier(2, timeout=10)

        t1 = threading.Thread(target=_exchange, args=(code, barrier, results))
        t2 = threading.Thread(target=_exchange, args=(code, barrier, results))
        t1.start()
        t2.start()
        t1.join(timeout=_THREAD_TIMEOUT)
        t2.join(timeout=_THREAD_TIMEOUT)

        assert not t1.is_alive(), "Thread 1 hung"
        assert not t2.is_alive(), "Thread 2 hung"

        statuses = [r for r in results if isinstance(r, int)]
        tokens = [r for r in results if isinstance(r, str) and r and "error" not in r]
        assert sorted(statuses) == [200, 403], f"Got {sorted(statuses)}"
        assert len(tokens) == 1, f"Expected 1 token, got {len(tokens)}"

        verify = PgSession()
        try:
            assert verify.query(Device).count() == 1
            pc = verify.query(PairingCode).filter(PairingCode.code == code).first()
            assert pc.used_at is not None
        finally:
            verify.close()


class TestRealConcurrentDifferentCodes:
    """Test 2: Different codes, concurrent first pairing — both succeed."""

    def test_concurrent_different_codes_both_200(self, _server, _pg_schema):
        session = PgSession()
        try:
            code_a = f"conc2a-{secrets.token_hex(4)}"
            code_b = f"conc2b-{secrets.token_hex(4)}"
            expires = datetime.now(UTC) + timedelta(minutes=15)
            session.add(PairingCode(code=code_a, expires_at=expires))
            session.add(PairingCode(code=code_b, expires_at=expires))
            session.commit()
        finally:
            session.close()

        results = []
        barrier = threading.Barrier(2, timeout=10)

        t1 = threading.Thread(target=_exchange, args=(code_a, barrier, results))
        t2 = threading.Thread(target=_exchange, args=(code_b, barrier, results))
        t1.start()
        t2.start()
        t1.join(timeout=_THREAD_TIMEOUT)
        t2.join(timeout=_THREAD_TIMEOUT)

        assert not t1.is_alive(), "Thread 1 hung"
        assert not t2.is_alive(), "Thread 2 hung"

        statuses = [r for r in results if isinstance(r, int)]
        tokens = [r for r in results if isinstance(r, str) and r and "error" not in r]
        assert sorted(statuses) == [200, 200], f"Got {sorted(statuses)}"
        assert len(tokens) == 2, f"Expected 2 tokens, got {len(tokens)}"

        verify = PgSession()
        try:
            assert verify.query(Relationship).count() == 1, "Only one relationship"
            assert verify.query(Device).count() == 2, "Two devices"
            for c in [code_a, code_b]:
                pc = verify.query(PairingCode).filter(PairingCode.code == c).first()
                assert pc.used_at is not None, f"Code {c} should be consumed"
        finally:
            verify.close()


class TestRealRecoveryRace:
    """Test 3: Two threads race with different codes. Both must succeed."""

    def test_concurrent_first_pairing_two_codes_both_200(self, _server, _pg_schema):
        """Both threads start with no relationship; one hits IntegrityError
        and recovers. Both must finish with 200, 1 relationship, 2 devices."""
        session = PgSession()
        try:
            code_a = f"racea-{secrets.token_hex(4)}"
            code_b = f"raceb-{secrets.token_hex(4)}"
            expires = datetime.now(UTC) + timedelta(minutes=15)
            session.add(PairingCode(code=code_a, expires_at=expires))
            session.add(PairingCode(code=code_b, expires_at=expires))
            session.commit()
        finally:
            session.close()

        results = []
        barrier = threading.Barrier(2, timeout=10)

        t1 = threading.Thread(target=_exchange, args=(code_a, barrier, results))
        t2 = threading.Thread(target=_exchange, args=(code_b, barrier, results))
        t1.start()
        t2.start()
        t1.join(timeout=_THREAD_TIMEOUT)
        t2.join(timeout=_THREAD_TIMEOUT)

        assert not t1.is_alive(), "Thread 1 hung"
        assert not t2.is_alive(), "Thread 2 hung"

        statuses = [r for r in results if isinstance(r, int)]
        tokens = [r for r in results if isinstance(r, str) and r and "error" not in r]
        assert sorted(statuses) == [200, 200], f"Got {sorted(statuses)}"
        assert len(tokens) == 2, f"Expected 2 tokens, got {len(tokens)}"

        verify = PgSession()
        try:
            assert verify.query(Relationship).count() == 1
            assert verify.query(Device).count() == 2
            for c in [code_a, code_b]:
                pc = verify.query(PairingCode).filter(PairingCode.code == c).first()
                assert pc.used_at is not None
        finally:
            verify.close()
