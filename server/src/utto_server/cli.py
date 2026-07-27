"""CLI management commands for utto-server."""

import secrets
from datetime import UTC, datetime, timedelta

from utto_server.database import SessionLocal
from utto_server.models import PairingCode


def generate_pairing_code(validity_minutes: int = 15) -> None:
    """Generate a one-time pairing code and print it to stdout."""
    code = secrets.token_hex(4)
    expires_at = datetime.now(UTC) + timedelta(minutes=validity_minutes)

    db = SessionLocal()
    try:
        pairing = PairingCode(code=code, expires_at=expires_at)
        db.add(pairing)
        db.commit()
    finally:
        db.close()

    print(f"Pairing code: {code}")
    print(f"Expires at:   {expires_at.isoformat(timespec='seconds')}Z")
    print("This code can be used only once.")


if __name__ == "__main__":
    generate_pairing_code()
