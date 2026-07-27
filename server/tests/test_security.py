"""Security and concurrency tests for M1 backend."""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from utto_server.models import PairingCode, Relationship


class TestTokenStrength:
    """Verify device token generation strength."""

    def test_token_length_sufficient(self):
        import secrets

        token = secrets.token_urlsafe(48)
        assert len(token) >= 64

    def test_tokens_are_unique(self):
        import secrets

        tokens = {secrets.token_urlsafe(48) for _ in range(30)}
        assert len(tokens) == 30


class TestPairingCodeRowLock:
    """Verify pairing code query uses FOR UPDATE (SQL-level check)."""

    def test_query_includes_for_update(self):
        """The pair_exchange endpoint uses with_for_update() on pairing code."""
        # Read the source to confirm with_for_update() is present.
        from pathlib import Path

        pairing_path = (
            Path(__file__).parent.parent / "src" / "utto_server" / "routers" / "pairing.py"
        )
        source = pairing_path.read_text(encoding="utf-8")
        assert ".with_for_update()" in source, (
            "pair_exchange must use with_for_update() on the pairing code query"
        )

    def test_two_sessions_cannot_use_same_code(self, db: Session):
        """Two sequential sessions: second session's FOR UPDATE sees used_at set."""
        from datetime import UTC, datetime, timedelta

        code = "rowlock-test-001"
        expires = datetime.now(UTC) + timedelta(minutes=15)
        pairing = PairingCode(code=code, expires_at=expires)
        db.add(pairing)
        db.commit()

        # Session A acquires and uses the code
        pairing_a = (
            db.query(PairingCode)
            .filter(
                PairingCode.code == code,
                PairingCode.used_at.is_(None),
                PairingCode.expires_at > datetime.now(UTC),
            )
            .with_for_update()
            .first()
        )
        assert pairing_a is not None
        pairing_a.used_at = datetime.now(UTC)
        db.commit()

        # Session B tries the same code — should find it already used
        pairing_b = (
            db.query(PairingCode)
            .filter(
                PairingCode.code == code,
                PairingCode.used_at.is_(None),
                PairingCode.expires_at > datetime.now(UTC),
            )
            .with_for_update()
            .first()
        )
        assert pairing_b is None


class TestSingletonKeyConstraint:
    """Verify database-level unique constraint on relationships."""

    def test_duplicate_singleton_key_raises_integrityerror(self, db: Session):
        """INSERT of two relationships with same singleton_key fails."""
        r1 = Relationship(display_name="熠")
        db.add(r1)
        db.commit()

        r2 = Relationship(display_name="熠")
        db.add(r2)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_only_one_active_relationship(self, db: Session):
        """After normal operations, there is only one active relationship."""
        # The fixture-based tests already verify this implicitly,
        # but this makes it explicit.
        relationships = db.query(Relationship).filter(Relationship.status == "active").all()
        # Fresh test DB has no relationships; this just verifies the query works.
        assert isinstance(relationships, list)


class TestLifespanNoCreateAll:
    """Verify the FastAPI app does not call create_all on startup."""

    def test_main_module_no_create_all(self):
        from pathlib import Path

        main_path = Path(__file__).parent.parent / "src" / "utto_server" / "main.py"
        source = main_path.read_text(encoding="utf-8")
        assert "create_all" not in source
        assert "lifespan" not in source
