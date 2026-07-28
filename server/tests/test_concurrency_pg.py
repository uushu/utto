"""PostgreSQL concurrency tests for M1 Backend pairing exchange.

These tests require a running PostgreSQL instance. They verify that the
pairing code row lock (FOR UPDATE) and singleton_key constraint work correctly.

Usage:
    pytest tests/test_concurrency_pg.py -v

Requires DATABASE_URL pointing to a PostgreSQL instance.
"""

import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from utto_server.models import Base, Device, PairingCode, Relationship

PG_URL = os.getenv("DATABASE_URL", "")
if not PG_URL.startswith("postgresql"):
    pytest.skip("DATABASE_URL not set to a PostgreSQL instance", allow_module_level=True)

_pg_engine = create_engine(PG_URL)
PgSession = sessionmaker(bind=_pg_engine, autoflush=False, autocommit=False)


@pytest.fixture(scope="function")
def pg_db():
    """Return a clean PostgreSQL session. Data cleared between tests."""
    Base.metadata.create_all(bind=_pg_engine)
    session = PgSession()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        Base.metadata.drop_all(bind=_pg_engine)


def _make_pairing_code(db: Session, code: str, expires_delta: int = 15):
    """Insert a fresh pairing code into the database."""
    expires = datetime.now(UTC) + timedelta(minutes=expires_delta)
    pc = PairingCode(code=code, expires_at=expires)
    db.add(pc)
    db.commit()


class TestSameCodeTwoSessions:
    """Test 1: Same pairing code, two sessions. Second sees used_at set."""

    def test_second_session_sees_code_as_used(self, pg_db: Session):
        """Session A consumes code; Session B finds it already used."""
        code = f"same-{secrets.token_hex(4)}"
        _make_pairing_code(pg_db, code)
        now = datetime.now(UTC)

        # Session A: acquire and consume
        sa = PgSession()
        pa = (
            sa.query(PairingCode)
            .filter(
                PairingCode.code == code,
                PairingCode.used_at.is_(None),
                PairingCode.expires_at > now,
            )
            .with_for_update()
            .first()
        )
        assert pa is not None, "Session A should find the code"
        pa.used_at = now

        rel = sa.query(Relationship).filter(Relationship.status == "active").first()
        if rel is None:
            rel = Relationship(display_name="熠")
            sa.add(rel)
            sa.flush()

        sa.add(
            Device(
                relationship_id=rel.id,
                token_hash=hashlib.sha256(secrets.token_urlsafe(48).encode()).hexdigest(),
            )
        )
        sa.commit()

        # Session B: try same code — should be None (used_at is set)
        sb = PgSession()
        pb = (
            sb.query(PairingCode)
            .filter(
                PairingCode.code == code,
                PairingCode.used_at.is_(None),
                PairingCode.expires_at > now,
            )
            .with_for_update()
            .first()
        )
        assert pb is None, "Session B should NOT find the code"

        sa.close()
        sb.close()

        assert pg_db.query(Device).count() == 1


class TestDifferentCodesTwoSessions:
    """Test 2: Two different codes, both succeed, one relationship, two devices."""

    def test_two_codes_two_devices_one_relationship(self, pg_db: Session):
        """Both codes produce tokens, only one relationship exists."""
        code_a = f"diff-a-{secrets.token_hex(4)}"
        code_b = f"diff-b-{secrets.token_hex(4)}"
        _make_pairing_code(pg_db, code_a)
        _make_pairing_code(pg_db, code_b)
        now = datetime.now(UTC)

        # Session A: use code_a, create relationship
        sa = PgSession()
        pa = (
            sa.query(PairingCode)
            .filter(
                PairingCode.code == code_a,
                PairingCode.used_at.is_(None),
                PairingCode.expires_at > now,
            )
            .with_for_update()
            .first()
        )
        assert pa is not None
        pa.used_at = now

        rel = sa.query(Relationship).filter(Relationship.status == "active").first()
        if rel is None:
            rel = Relationship(display_name="熠")
            sa.add(rel)
            sa.flush()

        sa.add(
            Device(
                relationship_id=rel.id,
                token_hash=hashlib.sha256(secrets.token_urlsafe(48).encode()).hexdigest(),
            )
        )
        sa.commit()

        # Session B: use code_b, reuse existing relationship
        sb = PgSession()
        pb = (
            sb.query(PairingCode)
            .filter(
                PairingCode.code == code_b,
                PairingCode.used_at.is_(None),
                PairingCode.expires_at > now,
            )
            .with_for_update()
            .first()
        )
        assert pb is not None
        pb.used_at = now

        rel = sb.query(Relationship).filter(Relationship.status == "active").first()
        assert rel is not None, "Relationship should already exist"

        sb.add(
            Device(
                relationship_id=rel.id,
                token_hash=hashlib.sha256(secrets.token_urlsafe(48).encode()).hexdigest(),
            )
        )
        sb.commit()

        sa.close()
        sb.close()

        assert pg_db.query(Relationship).filter(Relationship.status == "active").count() == 1
        assert pg_db.query(Device).count() == 2


class TestIntegrityErrorRecovery:
    """Test 3: Recovery path after IntegrityError re-validates pairing code."""

    def test_recovery_rejects_expired_code(self, pg_db: Session):
        """After rollback, an expired code is rejected (returns None)."""
        code = f"exp-{secrets.token_hex(4)}"
        expires = datetime.now(UTC) - timedelta(minutes=5)
        pg_db.add(PairingCode(code=code, expires_at=expires))
        pg_db.commit()

        s = PgSession()
        try:
            now = datetime.now(UTC)
            p = (
                s.query(PairingCode)
                .filter(
                    PairingCode.code == code,
                    PairingCode.used_at.is_(None),
                    PairingCode.expires_at > now,
                )
                .with_for_update()
                .first()
            )
            assert p is None, "Expired code should not be found"
        finally:
            s.rollback()
            s.close()

    def test_recovery_rejects_already_used_code(self, pg_db: Session):
        """After rollback, an already-used code is rejected."""
        code = f"rec-{secrets.token_hex(4)}"
        _make_pairing_code(pg_db, code)
        now = datetime.now(UTC)

        # Session A: consume the code
        sa = PgSession()
        pa = (
            sa.query(PairingCode)
            .filter(
                PairingCode.code == code,
                PairingCode.used_at.is_(None),
                PairingCode.expires_at > now,
            )
            .with_for_update()
            .first()
        )
        assert pa is not None
        pa.used_at = now
        sa.commit()

        # Session B: attempt same code (simulates recovery re-check)
        sb = PgSession()
        pb = (
            sb.query(PairingCode)
            .filter(
                PairingCode.code == code,
                PairingCode.used_at.is_(None),
                PairingCode.expires_at > now,
            )
            .with_for_update()
            .first()
        )
        assert pb is None, "Used code should not be found"

        sa.close()
        sb.close()
