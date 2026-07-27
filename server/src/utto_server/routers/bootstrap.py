"""Bootstrap router: GET /v1/bootstrap"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from utto_server.database import get_db
from utto_server.models import Device, PersonaVersion
from utto_server.routers.auth import get_current_device
from utto_server.schemas import BootstrapResponse

router = APIRouter(prefix="/v1", tags=["bootstrap"])


@router.get("/bootstrap", response_model=BootstrapResponse)
def bootstrap(
    device: Device = Depends(get_current_device),
    db: Session = Depends(get_db),
) -> BootstrapResponse:
    """Return initial data for the paired device: relationship and current persona."""
    relationship = device.relationship

    persona = (
        db.query(PersonaVersion)
        .filter(
            PersonaVersion.relationship_id == relationship.id,
            PersonaVersion.locked.is_(True),
        )
        .order_by(PersonaVersion.version.desc())
        .first()
    )

    persona_data = None
    if persona is not None:
        persona_data = {
            "version": persona.version,
            "self_identity": persona.self_identity,
            "user_model": persona.user_model,
            "relationship_definition": persona.relationship_definition,
            "core_traits": persona.core_traits,
            "agreements": persona.agreements,
            "locked": persona.locked,
            "source": persona.source,
            "created_at": persona.created_at.isoformat(),
        }

    return BootstrapResponse(
        relationship_id=relationship.id,
        display_name=relationship.display_name,
        persona=persona_data,
        device_last_seen=device.last_seen_at,
    )
