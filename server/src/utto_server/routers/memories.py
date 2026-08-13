"""Private, device-authenticated memory archive endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from utto_server.database import get_db
from utto_server.memory import capture_memories
from utto_server.models import Device, Memory
from utto_server.routers.auth import get_current_device
from utto_server.schemas import (
    ChatRequest,
    MemoryCreateRequest,
    MemoryOutput,
    MemoryUpdateRequest,
)

router = APIRouter(prefix="/v1/memories", tags=["memories"])


def _output(memory: Memory) -> MemoryOutput:
    return MemoryOutput(
        id=memory.id,
        category=memory.category,
        content=memory.content,
        importance=memory.importance,
        sensitivity=memory.sensitivity,
        status=memory.status,
        source=memory.source,
        created_at=memory.created_at,
        updated_at=memory.updated_at,
    )


@router.get("", response_model=list[MemoryOutput])
def list_memories(
    device: Device = Depends(get_current_device),
    db: Session = Depends(get_db),
) -> list[MemoryOutput]:
    memories = (
        db.query(Memory)
        .filter(Memory.relationship_id == device.relationship_id, Memory.status != "archived")
        .order_by(Memory.status.desc(), Memory.importance.desc(), Memory.updated_at.desc())
        .all()
    )
    return [_output(memory) for memory in memories]


@router.post("", response_model=MemoryOutput, status_code=201)
def create_memory(
    body: MemoryCreateRequest,
    device: Device = Depends(get_current_device),
    db: Session = Depends(get_db),
) -> MemoryOutput:
    memory = Memory(
        relationship_id=device.relationship_id,
        category=body.category,
        content=body.content.strip(),
        importance=body.importance,
        sensitivity="standard",
        status="active",
        source="manual",
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return _output(memory)


@router.patch("/{memory_id}", response_model=MemoryOutput)
def update_memory(
    memory_id: str,
    body: MemoryUpdateRequest,
    device: Device = Depends(get_current_device),
    db: Session = Depends(get_db),
) -> MemoryOutput:
    memory = (
        db.query(Memory)
        .filter(Memory.id == memory_id, Memory.relationship_id == device.relationship_id)
        .first()
    )
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")
    memory.status = body.status
    db.commit()
    db.refresh(memory)
    return _output(memory)


@router.post("/capture", status_code=202)
def capture_memory(
    body: ChatRequest,
    background_tasks: BackgroundTasks,
    device: Device = Depends(get_current_device),
) -> dict[str, str]:
    """Queue extraction separately so a chat reply never waits for it."""
    messages = [{"role": item.role, "content": item.content} for item in body.messages]
    background_tasks.add_task(capture_memories, device.relationship_id, messages)
    return {"status": "queued"}
