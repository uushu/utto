"""Pairing router: POST /v1/pair/exchange"""

import hashlib
import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from utto_server.database import get_db
from utto_server.models import Device, PairingCode, Relationship
from utto_server.schemas import PairExchangeRequest, PairExchangeResponse

router = APIRouter(prefix="/v1/pair", tags=["pairing"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/exchange", response_model=PairExchangeResponse)
def pair_exchange(body: PairExchangeRequest, db: Session = Depends(get_db)) -> PairExchangeResponse:
    """Exchange a one-time pairing code for a long-lived device token."""
    now = datetime.now(UTC)

    # Lock the pairing code row to prevent concurrent use of the same code.
    pairing = (
        db.query(PairingCode)
        .filter(
            PairingCode.code == body.pairing_code,
            PairingCode.used_at.is_(None),
            PairingCode.expires_at > now,
        )
        .with_for_update()
        .first()
    )

    if pairing is None:
        raise HTTPException(
            status_code=403,
            detail="Invalid, expired, or already used pairing code",
        )

    pairing.used_at = now

    # Ensure a single relationship exists.
    # Use singleton_key UNIQUE constraint to prevent concurrent duplicates.
    relationship = db.query(Relationship).filter(Relationship.status == "active").first()
    if relationship is None:
        relationship = Relationship(display_name="熠")
        db.add(relationship)
        try:
            db.flush()
        except IntegrityError:
            # Another concurrent request created the relationship first.
            db.rollback()

            # Re-acquire pairing code row lock and re-validate.
            # The rollback released the original lock; another transaction
            # may have consumed this pairing code in the meantime.
            pairing = (
                db.query(PairingCode)
                .filter(
                    PairingCode.id == pairing.id,
                    PairingCode.used_at.is_(None),
                    PairingCode.expires_at > now,
                )
                .with_for_update()
                .first()
            )

            if pairing is None:
                raise HTTPException(
                    status_code=403,
                    detail="Invalid, expired, or already used pairing code",
                )

            pairing.used_at = now

            # Re-query the singleton relationship by its known key.
            relationship = db.query(Relationship).filter(Relationship.singleton_key == "1").first()

            if relationship is None:
                raise HTTPException(
                    status_code=500,
                    detail="Server configuration error: relationship not found",
                )

    # Generate device token — 48 URL-safe random bytes = 384 bits of entropy.
    device_token = secrets.token_urlsafe(48)
    token_hash = _hash_token(device_token)

    device = Device(
        relationship_id=relationship.id,
        token_hash=token_hash,
        last_seen_at=now,
    )
    db.add(device)
    db.commit()
    db.refresh(device)

    return PairExchangeResponse(
        device_token=device_token,
        relationship_id=relationship.id,
        display_name=relationship.display_name,
        message="Pairing successful. Keep this token safe; it will not be shown again.",
    )
