"""Pydantic request and response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str


class PairExchangeRequest(BaseModel):
    pairing_code: str


class PairExchangeResponse(BaseModel):
    device_token: str
    relationship_id: str
    display_name: str
    message: str


class BootstrapResponse(BaseModel):
    relationship_id: str
    display_name: str
    persona: dict | None
    device_last_seen: datetime | None


class ChatMessageInput(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatAttachmentInput(BaseModel):
    id: str = Field(min_length=32, max_length=32)


class ChatRequest(BaseModel):
    messages: list[ChatMessageInput] = Field(min_length=1, max_length=20)
    attachments: list[ChatAttachmentInput] = Field(default_factory=list, max_length=5)


class ChatMessageOutput(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str


class ChatResponse(BaseModel):
    message: ChatMessageOutput
    model: str


class MemoryOutput(BaseModel):
    id: str
    category: str
    content: str
    importance: int
    sensitivity: str
    status: str
    source: str
    created_at: datetime
    updated_at: datetime


class MemoryCreateRequest(BaseModel):
    category: Literal["preference", "fact", "boundary", "relationship"] = "fact"
    content: str = Field(min_length=1, max_length=500)
    importance: int = Field(default=3, ge=1, le=5)


class MemoryUpdateRequest(BaseModel):
    status: Literal["active", "archived"]


class AttachmentUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(default="application/octet-stream", min_length=1, max_length=120)
    content_base64: str = Field(min_length=1, max_length=70_000_000)


class AttachmentOutput(BaseModel):
    id: str
    filename: str
    mime_type: str
    size_bytes: int
    readable_as_text: bool
    created_at: datetime
