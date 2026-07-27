"""Device token authentication dependency."""

import hashlib
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from utto_server.database import get_db
from utto_server.models import Device


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_current_device(request: Request, db: Session = Depends(get_db)) -> Device:
    """Extract device token from Authorization header and return the Device row."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty token")

    token_hash = _hash_token(token)
    device = (
        db.query(Device)
        .filter(
            Device.token_hash == token_hash,
            Device.revoked_at.is_(None),
        )
        .first()
    )

    if device is None:
        raise HTTPException(status_code=401, detail="Invalid or revoked token")

    device.last_seen_at = datetime.now(UTC)
    db.commit()

    return device
