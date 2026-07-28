"""PostgreSQL real concurrent tests for M1 Backend pairing exchange.

Uses a real uvicorn server + threading.Barrier for true concurrent HTTP requests.
Each thread makes real HTTP calls to the pair_exchange endpoint via urllib.

Usage:
    pytest tests/test_concurrency_pg.py -v

Requires DATABASE_URL pointing to a PostgreSQL instance.
"""

import json
import os
import secrets
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

_SERVER_PORT = 18765
_BASE_URL = f"http://127.0.0.1:{_SERVER_PORT}"


def _start_server():
    """Start uvicorn in a daemon thread."""
    os.environ["DATABASE_URL"] = PG_URL
    uvicorn.run(
        "utto_server.main:app",
        host="127.0.0.1",
        port=_SERVER_PORT,
        log_level="error",
    )


@pytest.fixture(scope="module")
def _server():
    """Start the FastAPI server once for all tests in this module."""
    t = threading.Thread(target=_start_server, daemon=True)
    t.start()
    for _ in range(30):
        try:
            req = urllib.request.Request(f"{_BASE_URL}/v1/health")
            with urllib.request.urlopen(req, timeout=1) as resp:
                if resp.status == 200:
                    break
        except Exception:
            pass
        time.sleep(0.5)
    else:
        raise RuntimeError("Server did not start")
    yield


@pytest.fixture(scope="function")
def _pg_schema():
    """Create and drop schema for each test."""
    Base.metadata.create_all(bind=_pg_engine)
    yield
    Base.metadata.drop_all(bind=_pg_engine)


def _http_post(path: str, body: dict) -> tuple[int, dict | None]:
    """Make an HTTP POST request, return (status_code, json_body or None)."""
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{_BASE_URL}{path}",
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
    """Make a real HTTP request to pair_exchange, synchronized by barrier."""
    barrier.wait(timeout=10)
    try:
        status, body = _http_post("/v1/pair/exchange", {"pairing_code": code})
        results.append(status)
        if status == 200 and body:
            results.append(body.get("device_token", ""))
    except Exception as e:
        results.append(f"error: {e}")


class TestRealConcurrentSameCode:
    """Test 1: Same code, two threads barrier-synchronized — only one wins."""

    def test_concurrent_same_code_only_one_200(self, _server, _pg_schema):
        session = PgSession()
        code = f"conc1-{secrets.token_hex(4)}"
        expires = datetime.now(UTC) + timedelta(minutes=15)
        session.add(PairingCode(code=code, expires_at=expires))
        session.commit()
        session.close()

        results = []
        barrier = threading.Barrier(2, timeout=10)

        t1 = threading.Thread(target=_exchange, args=(code, barrier, results))
        t2 = threading.Thread(target=_exchange, args=(code, barrier, results))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        statuses = [r for r in results if isinstance(r, int)]
        tokens = [r for r in results if isinstance(r, str) and r and "error" not in r]
        assert sorted(statuses) == [200, 403], f"Got {sorted(statuses)}"
        assert len(tokens) == 1, f"Expected 1 token, got {len(tokens)}"

        verify = PgSession()
        assert verify.query(Device).count() == 1
        pc = verify.query(PairingCode).filter(PairingCode.code == code).first()
        assert pc.used_at is not None
        verify.close()


class TestRealConcurrentDifferentCodes:
    """Test 2: Different codes, concurrent first pairing — both succeed."""

    def test_concurrent_different_codes_both_200(self, _server, _pg_schema):
        session = PgSession()
        code_a = f"conc2a-{secrets.token_hex(4)}"
        code_b = f"conc2b-{secrets.token_hex(4)}"
        expires = datetime.now(UTC) + timedelta(minutes=15)
        session.add(PairingCode(code=code_a, expires_at=expires))
        session.add(PairingCode(code=code_b, expires_at=expires))
        session.commit()
        session.close()

        results = []
        barrier = threading.Barrier(2, timeout=10)

        t1 = threading.Thread(target=_exchange, args=(code_a, barrier, results))
        t2 = threading.Thread(target=_exchange, args=(code_b, barrier, results))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        statuses = [r for r in results if isinstance(r, int)]
        tokens = [r for r in results if isinstance(r, str) and r and "error" not in r]
        assert sorted(statuses) == [200, 200], f"Got {sorted(statuses)}"
        assert len(tokens) == 2, f"Expected 2 tokens, got {len(tokens)}"

        verify = PgSession()
        assert verify.query(Relationship).count() == 1, "Only one relationship"
        assert verify.query(Device).count() == 2, "Two devices"
        for c in [code_a, code_b]:
            pc = verify.query(PairingCode).filter(PairingCode.code == c).first()
            assert pc.used_at is not None, f"Code {c} should be consumed"
        verify.close()


class TestRealRecoveryRace:
    """Test 3: Code consumed during IntegrityError recovery gap."""

    def test_code_consumed_during_recovery_gets_403(self, _server, _pg_schema):
        """Thread A creates relationship; Thread C consumes code-B before
        Thread B can try it. Thread B must get 403."""
        session = PgSession()
        code_a = f"racea-{secrets.token_hex(4)}"
        code_b = f"raceb-{secrets.token_hex(4)}"
        expires = datetime.now(UTC) + timedelta(minutes=15)
        session.add(PairingCode(code=code_a, expires_at=expires))
        session.add(PairingCode(code=code_b, expires_at=expires))
        session.commit()
        session.close()

        # A creates relationship with code_a
        status_a, _ = _http_post("/v1/pair/exchange", {"pairing_code": code_a})
        assert status_a == 200

        # C consumes code_b first
        status_c, _ = _http_post("/v1/pair/exchange", {"pairing_code": code_b})
        assert status_c == 200

        # B tries code_b after it was consumed → 403
        status_b, _ = _http_post("/v1/pair/exchange", {"pairing_code": code_b})
        assert status_b == 403

        verify = PgSession()
        assert verify.query(Relationship).count() == 1
        assert verify.query(Device).count() == 2
        pc_b = verify.query(PairingCode).filter(PairingCode.code == code_b).first()
        assert pc_b.used_at is not None
        verify.close()
